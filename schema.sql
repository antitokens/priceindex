CREATE TABLE
  IF NOT EXISTS prices (
    timestamp TEXT DEFAULT (datetime ('now', 'utc')),
    source TEXT NOT NULL,
    address TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (timestamp, address)
  );

CREATE TABLE
  IF NOT EXISTS market_caps (
    timestamp TEXT DEFAULT (datetime ('now', 'utc')),
    source TEXT NOT NULL,
    address TEXT NOT NULL,
    market_cap REAL NOT NULL,
    PRIMARY KEY (timestamp, address)
  );

CREATE TABLE
  IF NOT EXISTS hourly_prices (
    timestamp TEXT DEFAULT (datetime ('now', 'utc')),
    address TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (timestamp, address)
  );

CREATE TABLE
  IF NOT EXISTS daily_prices (
    timestamp TEXT DEFAULT (datetime ('now', 'utc')),
    address TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (timestamp, address)
  );

CREATE TABLE
  IF NOT EXISTS daily_market_caps (
    timestamp TEXT DEFAULT (datetime ('now', 'utc')),
    address TEXT NOT NULL,
    market_cap REAL NOT NULL,
    PRIMARY KEY (timestamp, address)
  );
