const fs = require('fs');

const filePath = './MobileMenu.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Regex to match the onClick handlers with window.location.href
const pattern = /<div\s+onClick={\(\) => { handleLinkClick\(\); window\.location\.href = '([^']+)'; }}\s+className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer \${[^}]+}`}\s+>\s+<([^>]+) className="h-5 w-5 mr-3" \/>\s+([^<]+)\s+<\/div>/g;

// Replace with Link components
const newContent = content.replace(pattern, (match, href, icon, text) => {
  return `<Link href="${href}" onClick={handleLinkClick}>
              <div
                className={\`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer \${
                  isActive("${href}")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }\`}
              >
                <${icon} className="h-5 w-5 mr-3" />
                ${text}
              </div>
            </Link>`;
});

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Links in MobileMenu.tsx updated successfully!');
