CREATE TABLE beans (
  id serial PRIMARY KEY,
  name text NOT NULL,
  shop text NOT NULL,
  summary text,
  url text,
  country text,
  region text,
  variety text,
  process text,
  roast_level text,
  is_decaf boolean NOT NULL DEFAULT false,
  purchased_at date,
  price integer CHECK (price >= 0),
  weight_g integer CHECK (weight_g > 0),
  brew_method text,
  roasted_at date,
  best_from date,
  acidity smallint CHECK (acidity BETWEEN 1 AND 10),
  sweetness smallint CHECK (sweetness BETWEEN 1 AND 10),
  body smallint CHECK (body BETWEEN 1 AND 10),
  aftertaste smallint CHECK (aftertaste BETWEEN 1 AND 10),
  total_score smallint,
  flavor_tags text[] NOT NULL DEFAULT '{}',
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cafe_visits (
  id serial PRIMARY KEY,
  menu text NOT NULL,
  cafe_name text NOT NULL,
  visited_at date,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  price integer CHECK (price >= 0),
  brew_method text,
  country text,
  variety text,
  process text,
  is_decaf boolean NOT NULL DEFAULT false,
  flavor_tags text[] NOT NULL DEFAULT '{}',
  address text,
  map_url text,
  mood_memo text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photos (
  id serial PRIMARY KEY,
  bean_id integer REFERENCES beans (id) ON DELETE CASCADE,
  cafe_visit_id integer REFERENCES cafe_visits (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  thumb_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_thumbnail boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((bean_id IS NULL) <> (cafe_visit_id IS NULL))
);

CREATE INDEX photos_bean_id_idx ON photos (bean_id);
CREATE INDEX photos_cafe_visit_id_idx ON photos (cafe_visit_id);
CREATE UNIQUE INDEX photos_one_thumbnail_per_bean ON photos (bean_id) WHERE is_thumbnail AND bean_id IS NOT NULL;
CREATE UNIQUE INDEX photos_one_thumbnail_per_cafe_visit ON photos (cafe_visit_id) WHERE is_thumbnail AND cafe_visit_id IS NOT NULL;
