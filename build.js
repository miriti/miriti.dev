import ejs from "ejs";
import fs from "fs";
import matter from "gray-matter";
import { marked } from "marked";
import path from "path";

/**
 * @typedef {"document" | "other"} FileType
 * @typedef {object} File
 * @property {FileType}  type
 * @property {string} full_path
 * @property {string} local_path
 * @property {string} name
 * @property {object} meta
 * @property {string} content
 *
 * @typedef {object} Dir
 * @property {string} full_path
 * @property {string} local_path
 * @property {string} name
 * @property {Array<Dir>} dirs
 * @property {Array<File>} files
 */

function createIndex() {
  /**
   * @param {Dir} dir
   * @param {string} sub_path
   */
  function scanDir(full_path, sub_path) {
    /** @type Dir */
    const dir = {
      full_path,
      local_path: sub_path,
      dirs: [],
      files: [],
      name: path.basename(full_path),
    };

    const files = fs.readdirSync(dir.full_path);

    for (const item of files) {
      if (item[0] === ".") continue;

      const item_full_path = path.join(dir.full_path, item);

      const local_path = path.join(sub_path, item);
      const parsed_path = path.parse(item_full_path);

      if (fs.lstatSync(item_full_path).isDirectory()) {
        dir.dirs.push(scanDir(item_full_path, local_path));
      } else {
        /** @type FileType */
        let type = "other";

        /** @type object */
        let meta = {};

        /** @type string */
        let content = null;

        if (parsed_path.ext === ".md") {
          type = "document";
          const file_data = fs.readFileSync(item_full_path, "utf-8");
          const parsed_file = matter(file_data);
          meta = parsed_file.data;
          content = parsed_file.content;
        }

        dir.files.push({
          type,
          full_path: item_full_path,
          local_path,
          meta,
          content,
          name: parsed_path.name,
        });
      }
    }

    return dir;
  }

  return scanDir("./src/content", "");
}

/**
 * @param {Dir} dir
 * @param {Dir} root
 */
function render(dir, root) {
  for (const subdir of dir.dirs) {
    fs.mkdirSync(path.join("out", subdir.local_path), { recursive: true });
    render(subdir, root);
  }

  for (const file of dir.files) {
    switch (file.type) {
      case "document":
        const tpl_file = path.join(
          "src/templates",
          `${file.meta.template || "default"}.ejs`
        );

        const data = {
          meta: file.meta,
          content: marked(file.content),
          root,
        };

        const html = ejs.render(fs.readFileSync(tpl_file, "utf-8"), data, {
          filename: tpl_file,
        });

        const html_file = path.join(
          "out",
          file.local_path.slice(0, -2) + "html"
        );

        console.log("HTML %s (%s)", file.local_path, html_file);
        fs.writeFileSync(html_file, html);

        break;

      case "other":
        console.log("COPY %s", file.local_path);
        fs.copyFileSync(file.full_path, path.join("out", file.local_path));
        break;
    }
  }
}

async function main() {
  const renderer = new marked.Renderer();

  renderer.link = function (href, title, text) {
    const parsed = path.parse(href);

    if (parsed.ext === ".md") {
      href = href.slice(0, -2) + "html";
    }

    return `<a href="${href}">${text}</a>`;
  };

  marked.setOptions({ renderer });

  fs.rmSync("out", { force: true, recursive: true });
  fs.mkdirSync("out");

  for(const file of ['prism.css', 'prism.js']) {
    fs.copyFileSync(`./src/${file}`, `./out/${file}`);
  }

  const index = createIndex();
  render(index, index);
}

main();
