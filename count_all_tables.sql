SELECT 
  table_name, 
  (SELECT count(*) FROM $(echo "\"$table_name\"")) as row_count
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY row_count DESC, table_name ASC;
