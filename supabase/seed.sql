-- Seed data: departments (spec §2), starter expense heads (spec §6) and the owner/admin.
-- Idempotent: safe to re-run. Admin can add, rename or deactivate heads later in the app.

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
insert into public.departments (name) values
  ('Front Office'),
  ('Store'),
  ('Accounts')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Expense heads (tally_ledger_name stays blank until Stage C)
-- ---------------------------------------------------------------------------
insert into public.expense_heads (code, name, group_name, hints, direction, sort_order) values
  ('FB-PROV',  'Provisions & groceries',     'F&B purchases',         array['rice','dal','atta','oil','masala','sugar'],                 'out',  10),
  ('FB-VEG',   'Vegetables & fruits',        'F&B purchases',         array['onion','tomato','vegetables','fruits','sabzi'],             'out',  20),
  ('FB-DAIRY', 'Milk & dairy',               'F&B purchases',         array['milk','curd','paneer','butter','ghee'],                     'out',  30),
  ('FB-MEAT',  'Meat, fish & eggs',          'F&B purchases',         array['chicken','mutton','fish','eggs'],                           'out',  40),
  ('FB-BEV',   'Beverages',                  'F&B purchases',         array['water bottles','soft drinks','tea','coffee'],               'out',  50),
  ('HK-SUP',   'Housekeeping supplies',      'Operating',             array['phenyl','detergent','mop','garbage bags'],                  'out',  60),
  ('HK-AMEN',  'Guest amenities',            'Operating',             array['soap','shampoo','toothbrush','dental kit','slippers'],      'out',  70),
  ('HK-LAUN',  'Laundry & linen',            'Operating',             array['laundry','dhobi','bedsheet','towel'],                       'out',  80),
  ('RM-ELEC',  'Repairs: electrical',        'Repairs & maintenance', array['electrician','wire','bulb','switch','MCB'],                 'out',  90),
  ('RM-PLUMB', 'Repairs: plumbing',          'Repairs & maintenance', array['plumber','tap','pipe','flush'],                             'out', 100),
  ('RM-BLDG',  'Repairs: building & civil',  'Repairs & maintenance', array['paint','mason','carpenter','tiles'],                         'out', 110),
  ('RM-EQP',   'Repairs: equipment & AC',    'Repairs & maintenance', array['AC service','fridge','lift','geyser'],                      'out', 120),
  ('UT-POWER', 'Electricity',                'Utilities',             array['BESCOM','electricity'],                                     'out', 130),
  ('UT-WATER', 'Water',                      'Utilities',             array['water tanker','BWSSB'],                                     'out', 140),
  ('UT-GAS',   'Gas / LPG',                  'Utilities',             array['LPG','cylinder','gas'],                                     'out', 150),
  ('UT-DSL',   'Diesel (generator)',         'Utilities',             array['diesel','DG'],                                              'out', 160),
  ('ADM-STAT', 'Printing & stationery',      'Administrative',        array['stationery','printing','pen','register'],                   'out', 170),
  ('ADM-COUR', 'Postage & courier',          'Administrative',        array['courier','speed post'],                                     'out', 180),
  ('ADM-TEL',  'Telephone & internet',       'Administrative',        array['recharge','broadband','Airtel','Jio'],                      'out', 190),
  ('ADM-CONV', 'Travel & conveyance',        'Administrative',        array['auto','cab','Uber','Ola','bus'],                            'out', 200),
  ('ADM-FUEL', 'Vehicle fuel',               'Administrative',        array['petrol','fuel'],                                            'out', 210),
  ('STF-WELF', 'Staff welfare',              'Staff',                 array['staff tea','festival','medical'],                           'out', 220),
  ('STF-FOOD', 'Staff food',                 'Staff',                 array['staff meals'],                                              'out', 230),
  ('SEC-PEST', 'Cleaning & pest control',    'Operating',             array['pest control','deep cleaning'],                             'out', 240),
  ('SEC-SEC',  'Security',                   'Operating',             array['security guard'],                                           'out', 250),
  ('MKT-ADV',  'Advertising & promotion',    'Sales & marketing',     array['flex','banner','ads'],                                      'out', 260),
  ('FIN-BANK', 'Bank charges',               'Finance',               array['bank charges'],                                             'out', 270),
  -- Fallback head: review flags MISC entries over ₹2,000 (spec §6, §9).
  ('MISC',     'Miscellaneous',              'Other',                 array[]::text[],                                                   'out', 280),
  -- Income-side heads for receipts and collections
  ('INC-ROOM', 'Room revenue',               'Income',                array[]::text[],                                                   'in',  900),
  ('INC-FB',   'F&B sales',                  'Income',                array[]::text[],                                                   'in',  910),
  ('INC-OTH',  'Other income',               'Income',                array[]::text[],                                                   'in',  920)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Owner / admin
-- Login identity is a synthetic email: admin@staff.hotelgeo.app, password = 6-digit PIN.
-- Create that user first in Supabase (Authentication → Users → Add user); this block then
-- links it. If the auth user doesn't exist yet, the staff row is created unlinked and
-- re-running this file later links it.
-- ---------------------------------------------------------------------------
insert into public.staff (username, full_name, role, department_id, auth_user_id)
select 'admin',
       'Owner',
       'admin',
       (select id from public.departments where name = 'Accounts'),
       (select id from auth.users where email = 'admin@staff.hotelgeo.app')
on conflict (username) do update
  set auth_user_id = coalesce(public.staff.auth_user_id, excluded.auth_user_id);
