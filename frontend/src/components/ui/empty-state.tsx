import type { LucideIcon } from "lucide-react";
import type { FC, ReactNode } from "react";

// The mark at the top is what stops an empty state reading as a paragraph that failed
// to load.
interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  /** An action, where there is one the reader can take from this screen. */
  readonly children?: ReactNode;
}

const EmptyState: FC<EmptyStateProps> = ({ icon: Icon, title, body, children }) => (
  <div className="border-border border-t py-16 text-center">
    <Icon aria-hidden="true" className="mx-auto size-6 text-text-faint" strokeWidth={1.5} />

    <p className="mt-4 text-lg text-text-muted">{title}</p>

    <p className="mx-auto mt-2 max-w-md text-balance text-sm text-text-faint leading-relaxed">
      {body}
    </p>

    {children !== undefined && <div className="mt-6 flex justify-center">{children}</div>}
  </div>
);

export default EmptyState;
