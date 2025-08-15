import React from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ segments, className }: { segments: Crumb[]; className?: string }) {
  if (!segments?.length) return null;
  return (
    <div className={cn("mb-3", className)}>
      <Breadcrumb>
        <BreadcrumbList>
          {segments.map((seg, idx) => {
            const isLast = idx === segments.length - 1;
            return (
              <React.Fragment key={idx}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{seg.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={seg.href || "#"}>{seg.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
