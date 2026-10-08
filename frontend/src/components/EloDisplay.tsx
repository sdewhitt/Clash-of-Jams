import type { Instrument, RankTier } from "@/lib/schema/types";

type EloDisplayProps = {
    instrument: Instrument;
    tier: RankTier;
    elo: number;
};

export function EloDisplay({ instrument, tier, elo }: EloDisplayProps) {
    const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(elo);
    const tierMap = {
        bronze: "bg-radial-[circle_at_top_left] from-amber-300 via-amber-700 to-amber-900 text-white",
        silver: "bg-radial-[circle_at_top_left] from-slate-100 via-slate-400 to-slate-500 text-black",
        gold: "bg-radial-[circle_at_top_left] from-amber-400 via-amber-500 to-amber-600 text-black",
        platinum: "bg-radial-[circle_at_top_left] from-gray-200 via-gray-300 to-gray-100 text-black",
        diamond: "bg-radial-[circle_at_top_left] from-blue-300 via-blue-500 to-blue-800 text-black"
    };

    const tierCaps = {
        bronze: "Bronze",
        silver: "Silver",
        gold: "Gold",
        platinum: "Platinum",
        diamond: "Diamond"
    }
    
    switch(instrument) {
        case "piano":
            return (
                <div
                    className={`group flex ${tierMap[tier]} px-4 py-2 rounded-lg`}
                >
                    <span className="group-hover:hidden select-none">
                        Piano-{formatted}
                    </span>

                    <span className="hidden group-hover:block select-none">
                        {tierCaps[tier]}-{formatted}
                    </span>
                </div>
            );
        case "guitar":
            return (
                <div
                    className={`group flex ${tierMap[tier]} px-4 py-2 rounded-lg`}
                >
                    <span className="group-hover:hidden select-none">
                        Guitar-{formatted}
                    </span>

                    <span className="hidden group-hover:block select-none">
                        {tierCaps[tier]}-{formatted}
                    </span>
                </div>
            );
        case "vocals":
            return (
                <div
                    className={`group flex ${tierMap[tier]} px-4 py-2 rounded-lg`}
                >
                    <span className="group-hover:hidden select-none">
                        Vocals-{formatted}
                    </span>

                    <span className="hidden group-hover:block select-none">
                        {tierCaps[tier]}-{formatted}
                    </span>
                </div>
            );
        case "woodwind":
            return (
                <div
                    className={`group flex ${tierMap[tier]} px-4 py-2 rounded-lg`}
                >
                    <span className="group-hover:hidden select-none">
                        Woodwind-{formatted}
                    </span>

                    <span className="hidden group-hover:block select-none">
                        {tierCaps[tier]}-{formatted}
                    </span>
                </div>
            );
        case "midi":
            return (
                <div
                    className={`group flex ${tierMap[tier]} px-4 py-2 rounded-lg`}
                >
                    <span className="group-hover:hidden select-none">
                        Midi-{formatted}
                    </span>

                    <span className="hidden group-hover:block select-none">
                        {tierCaps[tier]}-{formatted}
                    </span>
                </div>
            );
    }
}
