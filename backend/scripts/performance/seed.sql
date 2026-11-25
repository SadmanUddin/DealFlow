INSERT INTO users (name,email,password,role,email_verified)
SELECT 'Synthetic user ' || n, 'perf-' || n || '@example.test', $1,
       (CASE WHEN n = 100 THEN 'admin' WHEN n % 5 = 0 THEN 'seller' ELSE 'buyer' END)::user_role,
       true
FROM generate_series(1,100) AS n;

INSERT INTO business_listings
  (seller_id,title,description,industry,location,status,asking_price,currency,published_at)
SELECT 5 * (1 + n % 19), 'Benchmark business ' || n, repeat('Synthetic business profile. ', 16),
       (ARRAY['Software','Retail','Manufacturing','Hospitality'])[1+n%4],
       (ARRAY['Brussels','London','Paris'])[1+n%3],
       (CASE WHEN n % 7 = 0 THEN 'draft' WHEN n % 11 = 0 THEN 'pending' ELSE 'published' END)::listing_status,
       100000+n*2500, (ARRAY['EUR','GBP','USD'])[1+n%3], now()-n*interval '1 hour'
FROM generate_series(1,500) AS n;

INSERT INTO conversations (listing_id,buyer_id,seller_id,created_at)
SELECT id,1,seller_id, now()-id*interval '3 hours'
FROM business_listings WHERE status = 'published' ORDER BY id;

INSERT INTO conversations (listing_id,buyer_id,seller_id,created_at)
SELECT id,2 + id%3,seller_id, now()-id*interval '4 hours'
FROM business_listings WHERE status = 'published' ORDER BY id LIMIT 110;

INSERT INTO messages (conversation_id,sender_id,content)
SELECT c.id, CASE WHEN n%2=0 THEN c.buyer_id ELSE c.seller_id END, 'Synthetic inquiry message'
FROM conversations c CROSS JOIN generate_series(1,10) AS n;

INSERT INTO listing_view_events (listing_id,viewed_on,viewer_key)
SELECT id, current_date - n % 60, md5(id || ':' || n)
FROM business_listings CROSS JOIN generate_series(1,20) AS n;

INSERT INTO buyer_saved_searches (buyer_id,name,filters,frequency)
SELECT 1 + n%4, 'Synthetic search ' || n,
       jsonb_build_object('industry', (ARRAY['Software','Retail','Manufacturing','Hospitality'])[1+n%4],
                          'availability','available'),
       (ARRAY['off','instant','daily','weekly'])[1+n%4]
FROM generate_series(1,500) AS n;

INSERT INTO favorites (user_id,listing_id)
SELECT 1,id FROM business_listings WHERE status = 'published' AND id % 3 = 0;

INSERT INTO notifications (user_id,type,dedupe_key,read_at)
SELECT 1, 'listing.details', 'perf:' || n, CASE WHEN n%2=0 THEN now() END
FROM generate_series(1,5000) AS n;

ANALYZE;
