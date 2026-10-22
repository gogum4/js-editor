import { useEffect, useMemo, useRef, useState } from "react";

import { languageOptions, searchLanguages } from "@9um4/editor-schema/codeLanguages";
import { useEditorStrings } from "../context";

interface LanguagePickerProps {
  /** 지금 쓰는 언어의 정식 이름. 없으면 null (색 없는 일반 텍스트). */
  value: string | null;
  onChange: (language: string) => void;
}

const MAX_VISIBLE = 200;

/** 코드 블록의 언어를 고르는 목록. 193개 언어를 이름·별칭으로 검색할 수 있다. */
export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const strings = useEditorStrings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(
    () => (open ? searchLanguages(query).slice(0, MAX_VISIBLE) : []),
    [open, query],
  );

  // 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // 키보드로 옮길 때 활성 항목이 보이게 스크롤한다.
  useEffect(() => {
    listRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const openPicker = () => {
    setQuery("");
    setActive(0);
    setOpen(true);
  };

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="language-picker">
      <button
        type="button"
        className="language-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={strings.languagePicker.title}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        {value ?? strings.languagePicker.plainText}
        <span aria-hidden="true"> ▾</span>
      </button>

      {open && (
        <div className="language-picker-popup">
          <input
            autoFocus
            value={query}
            placeholder={strings.languagePicker.searchPlaceholder}
            aria-label={strings.languagePicker.searchLabel}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              // 한글 조합 중의 Enter·방향키·Esc는 입력기의 키이므로 무시한다.
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const picked = results[active];
                if (picked) choose(picked.name);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
          {results.length === 0 ? (
            <p className="language-picker-empty">{strings.languagePicker.empty}</p>
          ) : (
            <ul ref={listRef} role="listbox" aria-label={strings.languagePicker.listLabel}>
              {results.map((option, index) => (
                <li
                  key={option.name}
                  role="option"
                  aria-selected={option.name === value}
                  data-active={index === active}
                  data-language={option.name}
                  onMouseMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.name)}
                >
                  <span>{option.name}</span>
                  {option.aliases.length > 0 && (
                    <span className="language-picker-aliases">{option.aliases.slice(0, 4).join(", ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="language-picker-count">
            {query.trim() ? strings.languagePicker.matches(results.length) : strings.languagePicker.total(languageOptions().length)}
          </p>
        </div>
      )}
    </div>
  );
}
