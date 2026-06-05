import type { PublicChampion } from "@/types";

import { SearchableSelect } from "./searchable-select";

interface ChampionComboboxProps {
  champions: PublicChampion[];
  value: string;
  onChange: (championId: string) => void;
  label: string;
}

export function ChampionCombobox({ champions, value, onChange, label }: ChampionComboboxProps) {
  return (
    <SearchableSelect
      label={label}
      placeholder="Type a champion"
      value={value}
      onChange={onChange}
      options={champions.map((champion) => ({
        id: champion.id,
        label: champion.name,
        sublabel: champion.roles.join(" / "),
        imageUrl: champion.squareUrl
      }))}
    />
  );
}
