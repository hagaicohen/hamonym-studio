const commentsService = require('./comments.service');

exports.getComments = async (req, res) => {
  try {
    const comments = await commentsService.getComments(req.params.slug, req.query.search);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createComment = async (req, res) => {
  try {
    const { authorName, authorEmail, content } = req.body;
    if (!authorName?.trim() || !authorEmail?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'authorName, authorEmail and content are required' });
    }
    const comment = await commentsService.createComment(req.params.slug, { authorName, authorEmail, content });
    res.json({ comment });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
