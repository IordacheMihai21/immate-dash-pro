/**
 * Adapted from "Number Ticker Currency Counter" by shadcnspace (21st.dev).
 * Source: https://21st.dev/@shadcnspace/components/number-ticker-02
 */
import NumberFlow, { type Value } from "@number-flow/react";

type NumberTickerProps = {
  value: Value;
  currency?: string;
  decimals?: number;
  className?: string;
};

export default function NumberTicker({
  value,
  currency,
  decimals = 0,
  className,
}: NumberTickerProps) {
  return (
    <NumberFlow
      value={value}
      format={
        currency
          ? {
              style: "currency",
              currency,
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            }
          : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      }
      className={className}
    />
  );
}
