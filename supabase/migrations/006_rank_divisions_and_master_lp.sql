alter table user_rank_state
  add column if not exists division text;

alter table user_rank_state
  drop constraint if exists user_rank_state_lp_check;

alter table user_rank_state
  add constraint user_rank_state_lp_check check (lp >= 0);

update user_rank_state
set division = case
  when tier in ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond') and (division is null or division not in ('IV', 'III', 'II', 'I')) then 'IV'
  when tier in ('Unranked', 'Master', 'Grandmaster', 'Challenger') then null
  else division
end
where
  (tier in ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond') and (division is null or division not in ('IV', 'III', 'II', 'I')))
  or
  (tier in ('Unranked', 'Master', 'Grandmaster', 'Challenger') and division is not null);

alter table user_rank_state
  drop constraint if exists user_rank_state_division_check;

alter table user_rank_state
  add constraint user_rank_state_division_check check (
    (tier in ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond') and division in ('IV', 'III', 'II', 'I'))
    or
    (tier in ('Unranked', 'Master', 'Grandmaster', 'Challenger') and division is null)
  );

alter table ranked_game_results
  add column if not exists division_before text;

alter table ranked_game_results
  add column if not exists division_after text;
