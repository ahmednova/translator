import { Link } from "@tanstack/react-router";
import { FileText, History, Languages, Star } from "lucide-react";

const LINKS = [
  { to: "/", label: "Translate", icon: Languages },
  { to: "/history", label: "History", icon: History },
  { to: "/saved", label: "Saved", icon: Star },
  { to: "/documents", label: "Documents", icon: FileText },
] as const;

/** The app's pages, in the AppShell bar. On a phone, icons only. */
export function AppNav() {
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          aria-label={label}
          activeOptions={{ exact: true, includeSearch: false }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
        >
          <Icon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
