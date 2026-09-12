"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Debounced search that writes to the URL, so a result list stays shareable
 * and the back button behaves.
 */
export default function SearchField({
  defaultValue = "",
  placeholder = "Search transactions",
  basePath,
}: {
  defaultValue?: string;
  placeholder?: string;
  basePath: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed === defaultValue.trim()) return;
      router.replace(
        trimmed ? `${basePath}?q=${encodeURIComponent(trimmed)}` : basePath,
      );
    }, 300);
    return () => clearTimeout(id);
  }, [value, defaultValue, basePath, router]);

  return (
    <div className="relative">
      <Search
        size={17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
        style={{ color: "var(--ash-dim)" }}
      />
      <input
        className="field"
        // .field sets a padding shorthand, so Tailwind's pl-10 loses to it
        style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
        type="search"
        inputMode="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {value && (
        <button
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full"
          style={{ background: "var(--surface)", color: "var(--ash)" }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
