import {
  Sparkles,
  Home,
  LayoutGrid,
  LayoutTemplate,
  MessageSquare,
  Compass,
  Rocket,
  Store,
  BarChart3,
  Users,
  Settings2,
  HelpCircle,
  ScrollText,
  Shield,
  Gift,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const mainNav: NavItem[] = [
  { title: "Home", href: "/", icon: Home },
  { title: "Apps", href: "/projects", icon: LayoutGrid },
  { title: "Templates", href: "/templates", icon: LayoutTemplate },
  { title: "Explore", href: "/explore", icon: Compass },
  { title: "AI Chat", href: "/chat", icon: MessageSquare },
  { title: "Deploy", href: "/deploy", icon: Rocket },
  { title: "Marketplace", href: "/marketplace", icon: Store },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Community", href: "/community", icon: Users },
  { title: "Settings", href: "/settings", icon: Settings2 },
  { title: "Help", href: "/help", icon: HelpCircle },
  { title: "Changelog", href: "/changelog", icon: ScrollText },
];

export const navSections: NavSection[] = [
  {
    items: [
      { title: "Home", href: "/", icon: Home },
      { title: "Apps", href: "/projects", icon: LayoutGrid },
      { title: "Templates", href: "/templates", icon: LayoutTemplate },
      { title: "Explore", href: "/explore", icon: Compass },
    ],
  },
  {
    label: "AI",
    items: [
      { title: "AI Chat", href: "/chat", icon: MessageSquare },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Deploy", href: "/deploy", icon: Rocket },
      { title: "Marketplace", href: "/marketplace", icon: Store },
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
      { title: "Community", href: "/community", icon: Users },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Referrals", href: "/referrals", icon: Gift },
      { title: "Settings", href: "/settings", icon: Settings2 },
      { title: "Help", href: "/help", icon: HelpCircle },
      { title: "Changelog", href: "/changelog", icon: ScrollText },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Admin Panel", href: "/admin", icon: Shield },
    ],
  },
];

export const settingsNav: NavItem[] = [
  { title: "General", href: "/settings", icon: Settings2 },
  { title: "Account", href: "/settings/account", icon: Users },
  { title: "Billing", href: "/settings/billing", icon: BarChart3 },
  { title: "Team", href: "/settings/team", icon: Users },
  { title: "Models", href: "/settings/models", icon: Sparkles },
  { title: "API Keys", href: "/settings/api-keys", icon: ScrollText },
  { title: "Integrations", href: "/settings/integrations", icon: Store },
  { title: "Notifications", href: "/settings/notifications", icon: MessageSquare },
];
