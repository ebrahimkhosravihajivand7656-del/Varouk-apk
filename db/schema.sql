CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name VARCHAR(120) NOT NULL,
 phone VARCHAR(40) UNIQUE NOT NULL,
 password_hash TEXT,
 role VARCHAR(20) NOT NULL DEFAULT 'customer',
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name VARCHAR(120) NOT NULL,
 slug VARCHAR(160) UNIQUE NOT NULL,
 image_url TEXT,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 sort_order INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
 name VARCHAR(180) NOT NULL,
 slug VARCHAR(220) UNIQUE NOT NULL,
 description TEXT,
 image_url TEXT,
 price BIGINT NOT NULL DEFAULT 0,
 compare_price BIGINT,
 unit VARCHAR(40) NOT NULL DEFAULT 'عدد',
 stock NUMERIC(12,2) NOT NULL DEFAULT 0,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 featured BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS daily_prices (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id UUID REFERENCES products(id) ON DELETE CASCADE,
 price BIGINT NOT NULL,
 price_date DATE NOT NULL DEFAULT CURRENT_DATE,
 note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS festivals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name VARCHAR(180) NOT NULL,
 description TEXT,
 discount_percent NUMERIC(5,2),
 start_at TIMESTAMPTZ,
 end_at TIMESTAMPTZ,
 image_url TEXT,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS festival_products (
 festival_id UUID REFERENCES festivals(id) ON DELETE CASCADE,
 product_id UUID REFERENCES products(id) ON DELETE CASCADE,
 festival_price BIGINT,
 PRIMARY KEY(festival_id,product_id)
);
CREATE TABLE IF NOT EXISTS addresses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 title VARCHAR(80), recipient_name VARCHAR(120), phone VARCHAR(40),
 province VARCHAR(100), city VARCHAR(100), address TEXT, postal_code VARCHAR(30),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS carts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cart_items (
 cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
 product_id UUID REFERENCES products(id) ON DELETE CASCADE,
 quantity NUMERIC(12,2) NOT NULL,
 PRIMARY KEY(cart_id,product_id)
);
CREATE TABLE IF NOT EXISTS orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
 subtotal BIGINT NOT NULL DEFAULT 0,
 discount BIGINT NOT NULL DEFAULT 0,
 shipping BIGINT NOT NULL DEFAULT 0,
 total BIGINT NOT NULL DEFAULT 0,
 note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
 product_id UUID REFERENCES products(id) ON DELETE SET NULL,
 product_name VARCHAR(180) NOT NULL,
 unit_price BIGINT NOT NULL,
 quantity NUMERIC(12,2) NOT NULL,
 line_total BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id UUID REFERENCES products(id) ON DELETE CASCADE,
 quantity NUMERIC(12,2) NOT NULL,
 type VARCHAR(30) NOT NULL,
 note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
