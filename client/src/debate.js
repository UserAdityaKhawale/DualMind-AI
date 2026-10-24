export function buildReviewPairs(selectedModelIds, results, existingReviews = []) {
  const successful = results.filter((result) => result.status === 'success' && result.text?.trim());
  const pairs = [];
  for (const reviewerModel of selectedModelIds) {
    for (const target of successful) {
      if (reviewerModel === target.modelId) continue;
      const existing = existingReviews.find((item) => item.reviewerModel === reviewerModel && item.targetModel === target.modelId);
      if (existing?.status === 'success') continue;
      pairs.push({ reviewerModel, targetModel: target.modelId });
    }
  }
  return pairs;
}

export function orderSynthesizerCandidates(eligibleModels, successfulModelIds, preferredModelId = 'auto') {
  const unique = [...new Map(eligibleModels.map((model) => [model.id, model])).values()];
  if (preferredModelId !== 'auto') {
    return [...unique.filter((model) => model.id === preferredModelId), ...unique.filter((model) => model.id !== preferredModelId)];
  }
  return [...unique.filter((model) => successfulModelIds.includes(model.id)), ...unique.filter((model) => !successfulModelIds.includes(model.id))];
}
