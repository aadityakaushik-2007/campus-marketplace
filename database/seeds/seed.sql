-- Demo data only. Campus addresses use the configured thapar.edu domain.
INSERT INTO users (auth_user_id, name, email) VALUES
('00000000-0000-4000-8000-000000000001', 'Aarav Sharma', 'aarav.sharma@thapar.edu'),
('00000000-0000-4000-8000-000000000002', 'Diya Patel', 'diya.patel@thapar.edu'),
('00000000-0000-4000-8000-000000000003', 'Kabir Singh', 'kabir.singh@thapar.edu'),
('00000000-0000-4000-8000-000000000004', 'Meera Nair', 'meera.nair@thapar.edu'),
('00000000-0000-4000-8000-000000000005', 'Rohan Gupta', 'rohan.gupta@thapar.edu'),
('00000000-0000-4000-8000-000000000006', 'Ananya Iyer', 'ananya.iyer@thapar.edu'),
('00000000-0000-4000-8000-000000000007', 'Vivaan Rao', 'vivaan.rao@thapar.edu'),
('00000000-0000-4000-8000-000000000008', 'Isha Kapoor', 'isha.kapoor@thapar.edu'),
('00000000-0000-4000-8000-000000000009', 'Arjun Menon', 'arjun.menon@thapar.edu'),
('00000000-0000-4000-8000-000000000010', 'Sana Khan', 'sana.khan@thapar.edu');

INSERT INTO categories (name) VALUES
('Books'), ('Electronics'), ('Stationery'), ('Furniture'), ('Clothing'), ('Other');

INSERT INTO listings (owner_id, category_id, title, description, type, price, status) VALUES
(1, 1, 'Calculus: Early Transcendentals', 'Clean copy, 8th edition.', 'SELL', 450.00, 'ACTIVE'),
(2, 2, 'Electric Drill', 'Cordless drill with charger and bit set.', 'BORROW', NULL, 'ACTIVE'),
(3, 2, 'Scientific Calculator', 'Casio FX-991EX, fully working.', 'SELL', 700.00, 'ACTIVE'),
(4, 4, 'Study Desk', 'Compact wooden desk for a hostel room.', 'SELL', 1800.00, 'ACTIVE'),
(5, 5, 'Winter Hoodie', 'Grey medium-size hoodie in excellent condition.', 'SELL', 600.00, 'ACTIVE'),
(6, 3, 'Architecture Drawing Set', 'Compass, rulers and templates.', 'BORROW', NULL, 'ACTIVE'),
(7, 1, 'Introduction to Algorithms', 'Third edition, highlighted lightly.', 'SELL', 900.00, 'ACTIVE'),
(8, 2, 'USB-C Power Bank', '20000mAh power bank.', 'BORROW', NULL, 'ACTIVE'),
(9, 4, 'Ergonomic Chair', 'Adjustable study chair.', 'SELL', 2200.00, 'ACTIVE'),
(10, 5, 'Lab Coat', 'White lab coat, size L.', 'SELL', 350.00, 'ACTIVE'),
(1, 3, 'A4 File Folders Pack', 'Pack of ten unused folders.', 'SELL', 120.00, 'ACTIVE'),
(2, 6, 'Badminton Rackets', 'Two rackets and shuttle tube.', 'BORROW', NULL, 'ACTIVE'),
(3, 1, 'Organic Chemistry Textbook', 'Latest course edition.', 'SELL', 550.00, 'ACTIVE'),
(4, 2, 'Portable Bluetooth Speaker', 'Good for small events.', 'BORROW', NULL, 'ACTIVE'),
(5, 4, 'Floor Lamp', 'Warm LED lamp for a room.', 'SELL', 750.00, 'ACTIVE'),
(6, 5, 'Formal Blazer', 'Navy blue, size M.', 'SELL', 1100.00, 'ACTIVE'),
(7, 6, 'Umbrella', 'Large windproof umbrella.', 'BORROW', NULL, 'ACTIVE'),
(8, 3, 'Whiteboard Markers', 'Set of twelve assorted colours.', 'SELL', 180.00, 'ACTIVE');

INSERT INTO listing_images (listing_id, image_url) VALUES
(1, 'listing-images/calculus-textbook-1.jpg'),
(2, 'listing-images/electric-drill-1.jpg'),
(2, 'listing-images/electric-drill-2.jpg'),
(3, 'listing-images/calculator-1.jpg'),
(4, 'listing-images/study-desk-1.jpg'),
(5, 'listing-images/hoodie-1.jpg'),
(7, 'listing-images/algorithms-book-1.jpg'),
(9, 'listing-images/ergonomic-chair-1.jpg'),
(12, 'listing-images/badminton-rackets-1.jpg'),
(14, 'listing-images/speaker-1.jpg'),
(16, 'listing-images/blazer-1.jpg');

-- Half-open [) ranges make the first two Drill bookings adjacent and valid.
INSERT INTO borrowings (listing_id, borrower_id, start_time, end_time, status) VALUES
(2, 1, '2027-08-15 10:00:00+00', '2027-08-17 10:00:00+00', 'BOOKED'),
(2, 3, '2027-08-17 10:00:00+00', '2027-08-19 10:00:00+00', 'BOOKED'),
(2, 4, '2027-08-20 10:00:00+00', '2027-08-22 10:00:00+00', 'BOOKED'),
(6, 5, '2027-09-01 09:00:00+00', '2027-09-03 17:00:00+00', 'ACTIVE'),
(8, 6, '2027-09-05 12:00:00+00', '2027-09-06 12:00:00+00', 'RETURNED'),
(12, 9, '2027-09-10 08:00:00+00', '2027-09-11 20:00:00+00', 'CANCELLED'),
(14, 10, '2027-09-15 18:00:00+00', '2027-09-16 22:00:00+00', 'BOOKED'),
(17, 2, '2027-09-20 07:00:00+00', '2027-09-21 19:00:00+00', 'BOOKED');

-- Purchase transaction and SOLD transition are performed atomically per listing.
BEGIN;
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, status, completed_at)
VALUES (1, 2, 1, 450.00, 'COMPLETED', NOW());
UPDATE listings SET status = 'SOLD' WHERE listing_id = 1;
COMMIT;

BEGIN;
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, status, completed_at)
VALUES (4, 7, 4, 1800.00, 'COMPLETED', NOW());
UPDATE listings SET status = 'SOLD' WHERE listing_id = 4;
COMMIT;

BEGIN;
INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, status)
VALUES (5, 8, 5, 600.00, 'PENDING');
UPDATE listings SET status = 'SOLD' WHERE listing_id = 5;
COMMIT;
