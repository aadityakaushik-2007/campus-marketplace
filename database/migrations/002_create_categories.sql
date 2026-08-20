-- Categories used to group marketplace listings.
CREATE TABLE categories (
    category_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT categories_name_unique UNIQUE (name),
    CONSTRAINT categories_name_not_blank CHECK (btrim(name) <> '')
);
