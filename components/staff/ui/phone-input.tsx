"use client";

import * as React from "react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import he from "react-phone-number-input/locale/he";
import en from "react-phone-number-input/locale/en";
import { Button } from "@/components/staff/ui/button";
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/staff/ui/combobox";
import { Input } from "@/components/staff/ui/input";
import { cn } from "@/lib/mentoring/ui-utils";
import { normalizePhoneNumber } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<"input">, "onChange" | "value" | "ref" | "size"> & {
  value: string;
  onChange: (value: string) => void;
  locale?: "he" | "en";
  appearance?: "staff" | "public";
};

/** Shadcn phone-input composition adapted to our Base UI components and RTL forms. */
const PhoneInput = React.forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
  ({ className, value, onChange, locale = "he", appearance = "staff", disabled, readOnly, onBlur, ...props }, ref) => {
    const [blurred, setBlurred] = React.useState(false);
    const errorId = React.useId();
    const invalid = Boolean(blurred && value.trim() && !normalizePhoneNumber(value));
    const labels = locale === "he" ? he : en;
    const error = locale === "he" ? "יש להזין מספר טלפון תקין ולבחור את המדינה המתאימה." : "Enter a valid phone number and select its country.";
    return (
      <div data-slot="phone-input" data-appearance={appearance} className={cn("flex min-w-0 flex-col gap-2", appearance === "public" && "phone-input-public", className)}>
        <RPNInput.default
          {...props}
          ref={ref}
          dir="ltr"
          className="flex w-full min-w-0"
          defaultCountry="IL"
          labels={labels}
          addInternationalOption={false}
          countryOptionsOrder={["IL", "..."]}
          countrySelectComponent={CountrySelect}
          countrySelectProps={{ locale, appearance, invalid: props["aria-invalid"] || invalid, disabled: disabled || readOnly }}
          inputComponent={PhoneNumberField}
          flagComponent={Flag}
          smartCaret={false}
          autoComplete="tel"
          inputMode="tel"
          placeholder={props.placeholder ?? "050-123-4567"}
          disabled={disabled}
          readOnly={readOnly}
          value={normalizePhoneNumber(value) ?? (value || undefined)}
          onChange={(number) => onChange(number ?? "")}
          onBlur={(event) => { setBlurred(true); onBlur?.(event as React.FocusEvent<HTMLInputElement>); }}
          aria-invalid={props["aria-invalid"] || invalid || undefined}
          aria-describedby={[props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined}
        />
        {invalid && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    );
  },
);
PhoneInput.displayName = "PhoneInput";

const PhoneNumberField = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => <Input {...props} ref={ref} className={cn("rounded-s-none text-left", className)} />,
);
PhoneNumberField.displayName = "PhoneNumberField";

type CountryEntry = { label: string; value?: RPNInput.Country };
type CountrySelectProps = {
  value?: RPNInput.Country;
  onChange: (country: RPNInput.Country) => void;
  options: CountryEntry[];
  disabled?: boolean;
  locale: "he" | "en";
  appearance: "staff" | "public";
  invalid?: boolean | "true" | "false" | "grammar" | "spelling";
};

function CountrySelect({ value, onChange, options, disabled, locale, appearance, invalid }: CountrySelectProps) {
  const selected = options.find((option) => option.value === value);
  const countries = options.filter((option): option is CountryEntry & { value: RPNInput.Country } => Boolean(option.value));
  const isHebrew = locale === "he";
  return (
    <Combobox items={countries} value={selected ?? null} disabled={disabled} autoHighlight
      isItemEqualToValue={(item, selection) => item.value === selection.value}
      itemToStringLabel={(item) => `${item.label} +${RPNInput.getCountryCallingCode(item.value!)} ${item.value}`}
      onValueChange={(country) => { if (country?.value) onChange(country.value); }}>
      <ComboboxTrigger render={<Button type="button" variant="outline" disabled={disabled} />}
        className="gap-2 rounded-s-lg rounded-e-none border-e-0 px-3"
        aria-label={`${isHebrew ? "בחירת מדינה" : "Select country"}: ${selected?.label ?? ""}`}
        aria-invalid={invalid || undefined}>
        {value && <><Flag country={value} countryName={selected?.label ?? value} /><span dir="ltr">+{RPNInput.getCountryCallingCode(value)}</span></>}
      </ComboboxTrigger>
      <ComboboxContent className={cn("w-72", appearance === "public" && "phone-input-public")} dir={isHebrew ? "rtl" : "ltr"}>
        <ComboboxInput showTrigger={false} placeholder={isHebrew ? "חיפוש מדינה או קידומת…" : "Search country or calling code…"} aria-label={isHebrew ? "חיפוש מדינה" : "Search country"} />
        <ComboboxEmpty>{isHebrew ? "לא נמצאה מדינה מתאימה." : "No countries found."}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxCollection>{(country: CountryEntry & { value: RPNInput.Country }) => (
              <ComboboxItem key={country.value} value={country} className="min-h-11 gap-3">
                <Flag country={country.value} countryName={country.label} />
                <span className="min-w-0 flex-1 truncate">{country.label}</span>
                <span dir="ltr" className="text-muted-foreground">+{RPNInput.getCountryCallingCode(country.value)}</span>
              </ComboboxItem>
            )}</ComboboxCollection>
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function Flag({ country, countryName }: RPNInput.FlagProps) {
  const CountryFlag = flags[country];
  return <span aria-hidden="true" className="flex h-4 w-6 shrink-0 overflow-hidden rounded-sm [&_svg]:size-full">{CountryFlag && <CountryFlag title={countryName} />}</span>;
}

export { PhoneInput };
