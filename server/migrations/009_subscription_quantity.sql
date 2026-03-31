-- Track subscription quantity to control agent limits.
-- Each unit of subscription = 3 additional agent slots.
ALTER TABLE projects ADD COLUMN subscription_quantity INT NOT NULL DEFAULT 0;
