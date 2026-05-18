"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  SectionCard,
  SettingRow,
  FieldLabel,
  SectionFooter,
  selectCls,
  textareaCls,
} from "@/components/settings/shared";
import { cn } from "@/lib/utils";
import { Sun, Moon, Monitor, ImagePlus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { toast } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";

export default function SettingsGeneralPage() {
  const { profile, setProfile } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const supabase = createClient();

  const [sidebarStyle, setSidebarStyle] = React.useState(true);
  const [fontSize, setFontSize] = React.useState("15");
  const [workspaceName, setWorkspaceName] = React.useState("My Workspace");
  const [description, setDescription] = React.useState("");
  const [workspaceIconUrl, setWorkspaceIconUrl] = React.useState<string | null>(null);
  const [showBranding, setShowBranding] = React.useState(true);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const [deleteInput, setDeleteInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploadingIcon, setUploadingIcon] = React.useState(false);
  const iconInputRef = React.useRef<HTMLInputElement>(null);

  const isPaidPlan = profile && profile.plan_id !== "free";

  // Sync workspace fields from profile whenever the profile ID changes
  const profileId = profile?.id;
  React.useEffect(() => {
    if (!profile) return;
    setWorkspaceName(profile.workspace_name ?? "My Workspace");
    setDescription(profile.workspace_description ?? "");
    setWorkspaceIconUrl(profile.workspace_icon_url ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const baselineName = profile?.workspace_name ?? "My Workspace";
  const baselineDesc = profile?.workspace_description ?? "";
  const baselineIcon = profile?.workspace_icon_url ?? null;

  const workspaceDirty =
    workspaceName.trim() !== baselineName.trim() ||
    description.trim() !== baselineDesc.trim() ||
    (workspaceIconUrl ?? null) !== (baselineIcon ?? null);

  const themeOptions: { value: string; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="size-4" strokeWidth={1.6} /> },
    { value: "dark", label: "Dark", icon: <Moon className="size-4" strokeWidth={1.6} /> },
    { value: "system", label: "System", icon: <Monitor className="size-4" strokeWidth={1.6} /> },
  ];

  const activeTheme = hydrated ? (theme ?? "system") : "system";

  async function handleIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PNG, JPG, or WEBP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/workspace-icon", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const { publicUrl } = await res.json();
      const iconWithBust = `${publicUrl}?t=${Date.now()}`;
      setWorkspaceIconUrl(iconWithBust);

      const { data, error } = await supabase
        .from("profiles")
        .update({ workspace_icon_url: iconWithBust })
        .eq("id", profile.id)
        .select()
        .single();

      if (error) throw error;
      if (data) setProfile(data as typeof profile);
      toast.success("Saved successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to upload icon: ${msg}`);
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  }

  async function handleSaveWorkspace() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          workspace_name: workspaceName,
          workspace_description: description,
        })
        .eq("id", profile.id)
        .select()
        .single();

      if (error) throw error;
      if (data) setProfile(data as typeof profile);
      toast.success("Saved successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Appearance */}
      <SectionCard title="Appearance" description="Customize how DreamOS86 looks and feels.">
        <div className="space-y-6">
          <div>
            <FieldLabel>Theme</FieldLabel>
            <div className="flex gap-2">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!hydrated}
                  onClick={() => {
                    setTheme(opt.value);
                    toast.success(`Theme set to ${opt.label}`);
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-[13px] font-medium ring-1 transition-all duration-150 disabled:opacity-50",
                    activeTheme === opt.value
                      ? "bg-foreground/[0.07] ring-border-strong text-foreground"
                      : "bg-surface ring-border text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Font Size</FieldLabel>
              <select value={fontSize} onChange={(e) => setFontSize(e.target.value)} className={selectCls}>
                <option value="13">Small (13px)</option>
                <option value="14">Normal (14px)</option>
                <option value="15">Medium (15px)</option>
                <option value="16">Large (16px)</option>
              </select>
            </div>
          </div>

          <SettingRow title="Compact sidebar" description="Show icons only in the sidebar to maximize workspace area.">
            <Switch checked={sidebarStyle} onCheckedChange={setSidebarStyle} aria-label="Compact sidebar" />
          </SettingRow>
        </div>
      </SectionCard>

      {/* Workspace */}
      <SectionCard title="Workspace" description="General information about your workspace.">
        <div className="space-y-4">
          {/* Icon upload */}
          <div className="flex items-center gap-4">
            <div className="relative size-16 overflow-hidden rounded-[var(--radius-lg)] ring-1 ring-border flex items-center justify-center bg-accent-muted">
              {workspaceIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={workspaceIconUrl}
                  alt="Workspace icon"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[22px] font-bold text-accent select-none">
                  {workspaceName.charAt(0).toUpperCase()}
                </span>
              )}
              {uploadingIcon && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="size-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <div>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleIconChange}
              />
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => iconInputRef.current?.click()}
                disabled={uploadingIcon}
              >
                {uploadingIcon ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" strokeWidth={1.6} />
                )}
                {uploadingIcon ? "Uploading…" : "Upload icon"}
              </Button>
              <p className="mt-1.5 text-[12px] text-muted-foreground">PNG, JPG, or WEBP · max 5MB</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Workspace name</FieldLabel>
              <Input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="My Workspace"
              />
            </label>
          </div>

          <label className="block">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does your workspace do?"
              className={textareaCls}
            />
          </label>
        </div>
        <SectionFooter>
          <Button variant="ghost" size="md" onClick={() => {
            setWorkspaceName(profile?.workspace_name ?? "My Workspace");
            setDescription(profile?.workspace_description ?? "");
          }}>
            Discard
          </Button>
          <Button variant="accent" size="md" onClick={handleSaveWorkspace} disabled={saving || !workspaceDirty}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </SectionFooter>
      </SectionCard>

      {/* App Branding */}
      <SectionCard title="App Branding" description="Control how DreamOS86 branding appears on your generated apps.">
        <div className="space-y-1">
          <SettingRow
            title='Show "Built with DreamOS86"'
            description={
              isPaidPlan
                ? "Display a small DreamOS86 badge on your published apps. Uncheck to remove."
                : "Free plan includes the DreamOS86 watermark. Upgrade to Starter or higher to remove it."
            }
          >
            <Switch
              checked={isPaidPlan ? showBranding : true}
              onCheckedChange={isPaidPlan ? setShowBranding : undefined}
              disabled={!isPaidPlan}
              aria-label="Show DreamOS86 branding"
            />
          </SettingRow>
          {!isPaidPlan && (
            <p className="pl-1 text-[11.5px] text-muted-foreground">
              <a href="/pricing" className="text-accent hover:underline underline-offset-2">Upgrade to Starter</a>{" "}
              to remove the watermark from your apps.
            </p>
          )}
        </div>
      </SectionCard>

      {/* Danger Zone */}
      <SectionCard title="Danger Zone" description="Irreversible actions that affect your entire workspace." danger>
        {!deleteConfirm ? (
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[13px] font-medium text-foreground">Delete workspace</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Permanently delete this workspace, all projects, and data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="md"
              className="shrink-0 text-red-600 dark:text-red-400 ring-red-200/70 dark:ring-red-800/50 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="size-3.5" strokeWidth={1.6} />
              Delete workspace
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-red-100/60 dark:bg-red-950/30 px-4 py-3 ring-1 ring-red-200/60 dark:ring-red-800/40">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" strokeWidth={1.6} />
              <p className="text-[13px] text-red-700 dark:text-red-300">
                Type <strong>delete workspace</strong> below to confirm.
              </p>
            </div>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder='Type "delete workspace" to confirm'
              className="ring-red-200/70 dark:ring-red-800/40 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="md" onClick={() => { setDeleteConfirm(false); setDeleteInput(""); }}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="md"
                disabled={deleteInput !== "delete workspace"}
                className="text-red-600 dark:text-red-400 ring-red-200/70 dark:ring-red-800/50 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
              >
                Permanently delete
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
