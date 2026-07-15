const explicit = "postgresql://postgres:my%20secret@localhost:5432/mydb";
const parsedUrl = new URL(explicit);
console.log("pwd:", parsedUrl.password);
parsedUrl.password = "";
console.log("url:", parsedUrl.toString());
