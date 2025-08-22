const Group = require('../models/Group');

const createGroup = async (req, res) => {
  const { name, members } = req.body;
  const creator = req.user.id;

  try {
    const group = new Group({ name, members: [...members, creator], creator });
    await group.save();
    res.json(group);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};