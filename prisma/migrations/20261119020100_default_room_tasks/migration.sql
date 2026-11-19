-- Default "common" checklists by room type, so new floor plans have tasks from day one.
-- Idempotent: re-running adds nothing. Editable afterwards under Room tasks.
INSERT INTO "RoomTypeTask" ("id","roomType","label","sortOrder")
SELECT 'rtt_' || md5(t.room || t.label), t.room, t.label, t.ord FROM (VALUES
 ('Kitchen','Wipe counters & backsplash',0),('Kitchen','Clean sink & faucet',1),('Kitchen','Wipe appliance fronts',2),('Kitchen','Clean microwave in/out',3),('Kitchen','Empty trash',4),('Kitchen','Sweep & mop floor',5),
 ('Bathroom','Disinfect toilet',0),('Bathroom','Clean shower/tub',1),('Bathroom','Clean sink & mirror',2),('Bathroom','Restock paper & soap',3),('Bathroom','Empty trash',4),('Bathroom','Mop floor',5),
 ('Bedroom','Make bed / change linens',0),('Bedroom','Dust surfaces',1),('Bedroom','Vacuum floor',2),('Bedroom','Empty trash',3),
 ('Living Area','Dust surfaces & shelves',0),('Living Area','Wipe electronics (dry)',1),('Living Area','Vacuum upholstery',2),('Living Area','Vacuum/mop floor',3),
 ('Office','Empty trash & recycling',0),('Office','Dust desks (don''t move papers)',1),('Office','Wipe phones & keyboards',2),('Office','Vacuum floor',3),
 ('Hallway','Dust baseboards',0),('Hallway','Wipe light switches',1),('Hallway','Vacuum/mop floor',2),
 ('Entry','Clean entry glass',0),('Entry','Shake/vacuum mats',1),('Entry','Mop floor',2)
) AS t(room,label,ord)
ON CONFLICT ("id") DO NOTHING;
