import trash from "trash";
await trash(process.argv[2], { glob: false });
