import {fileURLToPath} from 'url';
import {readFileSync} from 'fs';
import {join} from 'path';
import Ajv from "ajv/dist/2020.js";
import {lstatSync, readdirSync} from "node:fs";
import {dirname, extname} from "node:path";

const path = fileURLToPath(new URL(import.meta.url).toString());
const schema = JSON.parse(readFileSync(join(path, '../../../schema-single.json'), 'utf-8'))
const rootPath = join(path, '../../../')

const ajv = new Ajv()

const validate = ajv.compile(schema)

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

files.map(function (value) {
    const data = readFileSync(value, 'utf8');
    const valid = validate(JSON.parse(data))
    if (!valid) {
        console.log(value);
        throw validate.errors;
    }
})

console.info('Schema is valid');
