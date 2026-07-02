const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'app', 'api');
const searchDirs = [
    path.join(__dirname, 'app'),
    path.join(__dirname, 'components'),
    path.join(__dirname, 'hooks'),
    path.join(__dirname, 'lib')
];

// 1. Get all API routes
function getApiRoutes(dir, routes = []) {
    if (!fs.existsSync(dir)) return routes;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getApiRoutes(fullPath, routes);
        } else if (item === 'route.ts' || item === 'route.js') {
            routes.push(fullPath);
        }
    }
    return routes;
}

const apiRoutes = getApiRoutes(apiDir);
const endpoints = apiRoutes.map(r => {
    let relative = r.substring(apiDir.length).replace(/\\/g, '/');
    relative = '/api' + relative.replace(/\/route\.(ts|js)$/, '');
    
    // Remove trailing / if not just /api
    if (relative.endsWith('/') && relative !== '/api') {
        relative = relative.slice(0, -1);
    }

    // For dynamic routes like /api/admin/users/[id], the frontend might call /api/admin/users/${id}
    // We search for the static prefix, e.g. /api/admin/users/ or /api/admin/users
    let searchString = relative.split('/[')[0];
    
    return { path: relative, searchString };
});

// Remove duplicate search strings to optimize
const uniqueEndpoints = [];
const seen = new Set();
for (const ep of endpoints) {
    if (!seen.has(ep.searchString)) {
        seen.add(ep.searchString);
        uniqueEndpoints.push(ep);
    }
}


// 2. Search for usages
function getFilesToSearch(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getFilesToSearch(fullPath, files);
        } else if (/\.(ts|tsx|js|jsx)$/.test(item)) {
            // Exclude API routes themselves from search
            if (!fullPath.includes(path.sep + 'api' + path.sep)) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

const allFiles = [];
for (const d of searchDirs) {
    getFilesToSearch(d, allFiles);
}

const fileContents = allFiles.map(f => fs.readFileSync(f, 'utf8'));

const unused = [];
for (const endpoint of endpoints) {
    let found = false;
    for (const content of fileContents) {
        if (content.includes(endpoint.searchString) || 
            content.includes(endpoint.searchString + '`') ||
            content.includes(endpoint.searchString + "'") ||
            content.includes(endpoint.searchString + '"') ||
            content.includes(endpoint.searchString + '/')) {
            found = true;
            break;
        }
    }
    if (!found) {
        unused.push(endpoint.path);
    }
}

console.log(JSON.stringify(unused, null, 2));
