import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { DETECT, LANGUAGES, languageName } from "@/lib/languages";

/** A language picker; `detect` adds "Detect language" first. */
export function LanguageSelect({
  value,
  onChange,
  detect = false,
  label,
  testId,
  detectedLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  detect?: boolean;
  label: string;
  testId: string;
  /** Shown instead of "Detect language" once a language was detected. */
  detectedLabel?: string;
}) {
  const items = [
    ...(detect ? [{ value: DETECT, label: "Detect language" }] : []),
    ...LANGUAGES.map((language) => ({
      value: language.code,
      label: language.name,
    })),
  ];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        aria-label={label}
        data-testid={testId}
        className="w-full bg-card sm:w-56"
      >
        <SelectValue>
          {(code: string) =>
            code === DETECT && detectedLabel
              ? detectedLabel
              : languageName(code)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-80">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
