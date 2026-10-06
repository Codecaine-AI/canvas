import type { ReactNode } from "react";

export type SectionProps = { title: string; children: ReactNode };

export function Section({ title, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-micro font-medium uppercase tracking-micro text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
