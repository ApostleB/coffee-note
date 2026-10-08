-- 품종을 쉼표 구분 입력 → text[] 로 바꾼다.
-- 기존 값: NULL/공백(탭·개행 포함) → '{}', 그 외 → 쉼표로 나눠 trim, 빈 원소 제거, 중복 제거(순서 유지)
CREATE OR REPLACE FUNCTION pg_temp.split_variety(value text) RETURNS text[] AS $$
  SELECT COALESCE(array_agg(item ORDER BY first_pos), '{}')
  FROM (
    SELECT item, min(pos) AS first_pos
    FROM (
      SELECT regexp_replace(part, '^[[:space:]]+|[[:space:]]+$', '', 'g') AS item, pos
      FROM unnest(string_to_array(COALESCE(value, ''), ',')) WITH ORDINALITY AS t(part, pos)
    ) parts
    WHERE item <> ''
    GROUP BY item
  ) uniq
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE beans
  ALTER COLUMN variety TYPE text[] USING pg_temp.split_variety(variety),
  ALTER COLUMN variety SET DEFAULT '{}',
  ALTER COLUMN variety SET NOT NULL;

ALTER TABLE cafe_visits
  ALTER COLUMN variety TYPE text[] USING pg_temp.split_variety(variety),
  ALTER COLUMN variety SET DEFAULT '{}',
  ALTER COLUMN variety SET NOT NULL;

DROP FUNCTION pg_temp.split_variety(text);
