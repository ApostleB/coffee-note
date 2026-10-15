-- 카페 후기 하나에 원두를 N개 기록한다: 원두 단위 필드를 cafe_visit_beans 로 옮긴다.
CREATE TABLE cafe_visit_beans (
  id serial PRIMARY KEY,
  cafe_visit_id integer NOT NULL REFERENCES cafe_visits (id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text NOT NULL,
  country text,
  variety text[] NOT NULL DEFAULT '{}',
  process text,
  brew_method text,
  is_decaf boolean NOT NULL DEFAULT false,
  flavor_tags text[] NOT NULL DEFAULT '{}',
  price integer CHECK (price >= 0),
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafe_visit_id, position)
);

CREATE INDEX cafe_visit_beans_cafe_visit_id_idx ON cafe_visit_beans (cafe_visit_id);

-- 기존 방문마다 원두 1개로 옮긴다. 별점(rating)·후기 메모(memo)는 방문에 그대로 남는다.
INSERT INTO cafe_visit_beans (cafe_visit_id, position, name, country, variety, process, brew_method, is_decaf, flavor_tags, price)
SELECT id, 0, menu, country, variety, process, brew_method, is_decaf, flavor_tags, price
FROM cafe_visits;

ALTER TABLE cafe_visits
  DROP COLUMN menu,
  DROP COLUMN country,
  DROP COLUMN variety,
  DROP COLUMN process,
  DROP COLUMN brew_method,
  DROP COLUMN is_decaf,
  DROP COLUMN flavor_tags,
  DROP COLUMN price;
