#!/usr/bin/env bash

# Input parameter (optional)
target_folder="$1"
output_file="combined_project_files.js"

# Remove the output file if it already exists
[ -f "$output_file" ] && rm "$output_file"

# Set limit
file_limit=50

# Determine search path
if [ "$target_folder" == "frontend" ] || [ "$target_folder" == "server" ]; then
    search_path="./$target_folder"
else
    search_path="."
fi

echo "Searching in: $search_path"
echo "Including files (up to $file_limit):"
echo "------------------------------------"

# Temp file to store metadata
temp_metadata=$(mktemp)

# Collect metadata
find "$search_path" -type f \( -name "*.js" -o -name "*.db" -o -name "*.env" -o -name "*.md" \) \
  -not -path "*/node_modules/*" \
  -not -name "structure.md" \
  -not -iname "readme.md" \
  -not -path "*/logs/*" \
  -not -path "*/reports/*" \
  -not -path "*/backendApproach/*" \
  -not -path "*/dataRequired/*" \
  -not -path "*/doc/*" \
  | while read -r file; do
    lines=$(wc -l < "$file" | xargs)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        modified=$(stat -f "%m" "$file")  # Unix timestamp on macOS
        readable_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$file")
    else
        modified=$(stat -c "%Y" "$file")
        readable_date=$(stat -c "%y" "$file" | cut -d'.' -f1)
    fi
    echo "$modified|$file|$lines|$readable_date" >> "$temp_metadata"
done

# Sort by modified descending and loop through results
sort -r -n "$temp_metadata" | head -n "$file_limit" | while IFS='|' read -r mod file lines readable; do
    echo "$file — $lines lines — Last modified: $readable"

    # Append to combined output file (remove blank lines from each file)
    echo "// File: $file" >> "$output_file"
    grep -v '^[[:space:]]*$' "$file" >> "$output_file"
done

echo "------------------------------------"
combined_count=$(wc -l < "$temp_metadata" | xargs)
echo "✅ Combined $( [ "$combined_count" -gt "$file_limit" ] && echo "$file_limit" || echo "$combined_count" ) files from '${target_folder:-entire project}' into $output_file."

# Clean up
rm "$temp_metadata"
