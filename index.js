const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("Backend is running:)");
});

//User Management Routes
app.get("/users", (req, res) => {
  res.send("Get All of the users");
});
app.post("/users", (req, res) => {
  res.send("Got a POST request");
});
app.put("/users", (req, res) => {
  res.send("Got a PUT request at /user");
});
app.delete("/users", (req, res) => {
  res.send("Got a DELETE request at /user");
});
app.get("/users/:id", (req, res) => {
  res.send(req.params);
});

//Product Management Routes
app.get("/products", (req, res) => {
  res.send("Get All of the products");
});
app.post("/products", (req, res) => {
  res.send("Got a POST request");
});
app.put("/products", (req, res) => {
  res.send("Got a PUT request at /products");
});
app.delete("/products", (req, res) => {
  res.send("Got a DELETE request at /products");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
