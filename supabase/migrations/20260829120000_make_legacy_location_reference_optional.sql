-- A newly created plot may not have a historical cemetery reference yet.
-- Keep the legacy value when it exists, but do not require a fabricated value.
alter table public.lot
    alter column legacy_location_code drop not null;

comment on column public.lot.legacy_location_code is
    'Optional original Lot Location value from older cemetery records; null for genuinely new plots.';
