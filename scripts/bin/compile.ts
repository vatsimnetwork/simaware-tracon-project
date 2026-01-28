import type {FeatureCollection, MultiPolygon, Polygon} from "geojson";
import {join} from "path";
import {lstatSync, readdirSync, readFileSync, writeFile} from "node:fs";
import {dirname, extname} from "node:path";
import {fileURLToPath} from "url";

const template = {
    type: "FeatureCollection",
    '$schema': 'https://raw.githubusercontent.com/vatsimnetwork/simaware-tracon-project/refs/heads/main/schema.json',
    name: "fix",
    crs: {type: "name", properties: {name: "urn:ogc:def:crs:OGC:1.3:CRS84"}},
    features: []
} as FeatureCollection<MultiPolygon | Polygon>

const path = fileURLToPath(new URL(import.meta.url).toString());
const rootPath = join(path, '../../../')

const files: string[] = [];

function traverseDir(dir: string) {
    readdirSync(dir).forEach(file => {
        let fullPath = join(dir, file);
        if (lstatSync(fullPath).isDirectory()) {
            traverseDir(fullPath);
        } else {
            if (!dirname(fullPath).toLowerCase().includes("node_modules") &&
                extname(fullPath).toLowerCase() === ".json") {
                files.push(fullPath);
            }
        }
    })
}

traverseDir(join(rootPath, "Boundaries"));

files.map(function (value, index) {
    const data = readFileSync(value, 'utf8');
    template.features.push(JSON.parse(data));
})

writeFile(join(rootPath, "/TRACONBoundaries.geojson"), JSON.stringify(template), err => {
    if (err) {
        console.error(err);
    }
});