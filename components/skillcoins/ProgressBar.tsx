import { progressOf } from "@/lib/skillcoins";

type Props = { cost: number; balance: number; size?: "sm" | "lg"; showNumbers?: boolean; dark?: boolean };

/** Barra «125 / 200 SC». Al llegar al coste cambia de color. */
export default function ProgressBar({ cost, balance, size = "sm", showNumbers = true, dark = false }: Props) {
  const { have, missing, percent, reached } = progressOf(cost, balance);
  const height = size === "lg" ? "h-4" : "h-2";
  return (
    <div className="space-y-1.5">
      {showNumbers && (
        <div className={`flex items-baseline justify-between gap-2 ${size === "lg" ? "text-sm" : "text-[11px]"}`}>
          <span className={`font-bold tabular-nums ${dark ? "text-white" : "text-[#292825]"}`}>
            {have.toLocaleString("es-ES")} / {cost.toLocaleString("es-ES")} SC
          </span>
          <span className={reached ? `font-bold ${dark ? "text-[#CFE3C9]" : "text-[#4F6B4A]"}` : dark ? "text-[#E8E2D8]" : "text-[#77736B]"}>
            {reached ? "¡Lo tienes!" : `Te faltan ${missing.toLocaleString("es-ES")} SC`}
          </span>
        </div>
      )}
      <div
        className={`${height} rounded-full overflow-hidden ${dark ? "bg-white/15" : "bg-[#E9E4DB]"}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cost}
        aria-valuenow={have}
        aria-label={`${have} de ${cost} SkillCoins`}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ${reached ? "bg-[#6B8F64]" : dark ? "bg-[#D7C8AF]" : "bg-[#8A775B]"}`}
          style={{ width: percent + "%" }}
        />
      </div>
    </div>
  );
}
