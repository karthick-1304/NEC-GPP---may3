// src/validators/topic.validator.js
import Joi from 'joi';

export const createTopicSchema = Joi.object({
  topic_name: Joi.string().min(2).max(50).trim().required()
    .messages({ 'string.min': 'Topic name must be at least 2 characters.' }),
});

export const updateTopicSchema = Joi.object({
  topic_name: Joi.string().min(2).max(50).trim().required(),
});

// Reorder: array of { topic_id, display_order }
export const reorderTopicsSchema = Joi.object({
  order: Joi.array().items(
    Joi.object({
      topic_id:      Joi.number().integer().positive().required(),
      display_order: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
});

export const listTopicsQuerySchema = Joi.object({
  search: Joi.string().max(100).trim().allow('', null),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(1000).default(6),
});