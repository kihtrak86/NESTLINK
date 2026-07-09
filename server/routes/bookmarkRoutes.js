const express = require("express");
const router = express.Router();
const {
  getBookmarks,
  getTags,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} = require("../controllers/bookmarkController");
const { protect } = require("../middleware/auth");

router.use(protect);
router.get("/tags", getTags);
router.route("/").get(getBookmarks).post(createBookmark);
router.route("/:id").put(updateBookmark).delete(deleteBookmark);

module.exports = router;
