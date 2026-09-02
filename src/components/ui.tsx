import { ReactNode } from "react";
import Link from "next/link";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-vinyl-border shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-vinyl-border">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-vinyl-ink truncate">{title}</h2>
        {subtitle && <p className="text-sm text-vinyl-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function Badge({ children, color = "slate" }: { children: ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    slate: "bg-vinyl-paper text-vinyl-muted",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-orange-100 text-vinyl-coral-dark",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] ?? colors.slate}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit" | "reset";
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
}) {
  const variants: Record<string, string> = {
    primary: "bg-vinyl-coral text-white hover:bg-vinyl-coral-dark",
    secondary: "bg-white text-vinyl-ink border border-vinyl-border hover:bg-vinyl-paper",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-vinyl-teal hover:bg-vinyl-paper",
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, name, hint, ...props }: { label?: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-vinyl-ink mb-1">{label}</span>}
      <input
        name={name}
        className="w-full rounded-md border border-vinyl-border px-3 py-2 text-sm text-vinyl-ink focus:outline-none focus:ring-2 focus:ring-vinyl-teal focus:border-vinyl-teal"
        {...props}
      />
      {hint && <span className="block text-xs text-vinyl-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  children,
  ...props
}: { label?: string; name: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-vinyl-ink mb-1">{label}</span>}
      <select
        name={name}
        className="w-full rounded-md border border-vinyl-border px-3 py-2 text-sm text-vinyl-ink focus:outline-none focus:ring-2 focus:ring-vinyl-teal focus:border-vinyl-teal bg-white"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({ label, name, ...props }: { label?: string; name: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-vinyl-ink mb-1">{label}</span>}
      <textarea
        name={name}
        className="w-full rounded-md border border-vinyl-border px-3 py-2 text-sm text-vinyl-ink focus:outline-none focus:ring-2 focus:ring-vinyl-teal focus:border-vinyl-teal"
        rows={3}
        {...props}
      />
    </label>
  );
}

export function StatCard({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <div className="px-5 py-4 h-full flex flex-col justify-center">
      <p className="text-sm text-vinyl-muted">{label}</p>
      <p className="font-display text-2xl font-semibold text-vinyl-teal mt-1">{value}</p>
      <p className="text-xs text-vinyl-muted mt-1 min-h-[1em]">{hint ?? " "}</p>
    </div>
  );
  if (!href)
    return <div className="h-full bg-vinyl-paper rounded-2xl border-[3px] border-vinyl-sun shadow-sm">{body}</div>;
  return (
    <Link href={href} className="block h-full">
      <div className="h-full bg-vinyl-paper rounded-2xl border-[3px] border-vinyl-sun shadow-sm hover:border-vinyl-coral hover:shadow-md transition-shadow">
        {body}
      </div>
    </Link>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-vinyl-muted text-center py-8">{text}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold text-vinyl-ink">{title}</h1>
        {subtitle && <p className="text-sm text-vinyl-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
