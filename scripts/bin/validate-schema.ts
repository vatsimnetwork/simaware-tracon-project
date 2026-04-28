import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { join } from "path";
import Ajv from "ajv/dist/2020.js";
import { findJsonFiles } from "./lib/traverse.ts";

const path = fileURLToPath(new URL(import.meta.url).toString());
const schema = JSON.parse(
  readFileSync(join(path, "../../../schema-single.json"), "utf-8"),
);
const rootPath = join(path, "../../../");

const ajv = new Ajv();
const validate = ajv.compile(schema);

const files = findJsonFiles(join(rootPath, "Boundaries"));

files.forEach(function (value) {
  const data = readFileSync(value, "utf8");
  const valid = validate(JSON.parse(data));
  if (!valid) {
    console.log(value);
    throw validate.errors;
  }
});

console.info("Schema is valid");
