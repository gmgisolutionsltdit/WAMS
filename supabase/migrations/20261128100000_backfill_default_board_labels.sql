-- Every new board is meant to start with the same 6 unnamed labels Trello
-- seeds (TaskBoard.tsx's own fallback board-creation path already does
-- this), but the main "Create board" flow (BoardCreatePopover.tsx) never
-- did, so any board created through it shows "No labels yet" instead of
-- the usual colored swatches. Backfill the same 6 colors for every
-- existing task_boards row that currently has zero task_labels rows.

INSERT INTO public.task_labels (board_id, name, color, position)
SELECT b.id, '', c.color, c.ord
FROM public.task_boards b
CROSS JOIN (
  VALUES
    ('#4bce97', 0),
    ('#f5cd47', 1),
    ('#fea362', 2),
    ('#f87168', 3),
    ('#9f8fef', 4),
    ('#579dff', 5)
) AS c(color, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.task_labels l WHERE l.board_id = b.id);
