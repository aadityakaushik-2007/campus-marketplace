-- Stores references to listing images kept in Supabase Storage.
CREATE TABLE listing_images (
    image_id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT listing_images_listing_fk FOREIGN KEY (listing_id)
        REFERENCES listings (listing_id) ON DELETE RESTRICT,

    CONSTRAINT listing_images_url_not_blank CHECK (btrim(image_url) <> '')
);

-- The actual image is stored in Supabase Storage; this table only keeps its URL/path.
COMMENT ON TABLE listing_images IS 'Stores Supabase Storage URLs or paths, not image binary data.';
