const fs = require('fs');
const path = require('path');

var template = { type: "FeatureCollection", name: "fix", crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } }, features: [] }

const files = [];
traverseDir(path.join(__dirname, "Boundaries"));

let promises = files.map(function(value, index) {
    return new Promise(function(resolve) {
        fs.readFile(value, 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                return;
            }
            template.features.push(JSON.parse(data));
            resolve();
        })
    })
})

Promise.all(promises).then(function() {
    fs.writeFile(__dirname + "/TRACONBoundaries.geojson", JSON.stringify(template), err => {
        if (err) {
            console.error(err);
        }
    });
});

function traverseDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            traverseDir(fullPath);
        } else {
            if (!path.dirname(fullPath).toLowerCase().includes("node_modules") &&
                path.extname(fullPath).toLowerCase() === ".json") {
                files.push(fullPath);
            }
        }
    })
}