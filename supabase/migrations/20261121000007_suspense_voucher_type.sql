-- New voucher type: suspense (money paid out before the bills are known; spec update Nov 2026).
-- Kept alone in its own migration: Postgres can't use a new enum value in the same transaction.
alter type public.voucher_type add value if not exists 'suspense_voucher';
