import { Suspense } from "react";
import { ContactForm } from "@/components/marketing/contact-form";

function FormSkeleton() {
  return (
    <div className="mx-auto h-80 max-w-lg animate-pulse rounded-2xl border border-border/60 bg-surface/40 p-8" />
  );
}

export function ContactPageContent({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className={
        embedded
          ? "px-4 py-8 sm:px-6"
          : "relative overflow-hidden px-4 py-10 sm:px-6 sm:py-14"
      }
    >
      {!embedded ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px] bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,hsl(var(--accent)/0.2),transparent_70%)]"
        />
      ) : null}
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-balance text-[28px] font-semibold tracking-tight text-foreground sm:text-[34px]">
          Contact DreamOS86
        </h1>
        <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted-foreground">
          Tell us what you&apos;re building or what you need help with. We&apos;ll get back to you.
        </p>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <div className="mt-10">
          <ContactForm />
        </div>
      </Suspense>
    </div>
  );
}
