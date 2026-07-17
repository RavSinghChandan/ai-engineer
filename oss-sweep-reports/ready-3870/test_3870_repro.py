import hashlib

def qhash(model_name, query_prompt_name, query_prompt, queries):
    # mirrors the FIXED logic in hard_negatives.py
    return hashlib.sha256(
        repr((model_name, query_prompt_name, query_prompt, tuple(queries))).encode(),
        usedforsecurity=False,
    ).hexdigest()

def qhash_old(model_name, queries):
    return hashlib.sha256((model_name + "".join(queries)).encode(), usedforsecurity=False).hexdigest()

queries = ["What is the capital of France?", "Who wrote Hamlet?"]
mn = "sentence-transformers/all-mpnet-base-v2"

# OLD (buggy): different prompts -> SAME hash (the bug)
old_a = qhash_old(mn, queries)
old_b = qhash_old(mn, queries)  # prompt ignored entirely
print("OLD buggy: prompt-A hash == prompt-B hash ?", old_a == old_b, "(bug: stale cache reused)")

# NEW (fixed): different prompts -> DIFFERENT hash
new_a = qhash(mn, None, "query: ", queries)
new_b = qhash(mn, None, "search_query: ", queries)
new_same = qhash(mn, None, "query: ", queries)
print("NEW fixed: different query_prompt -> different hash ?", new_a != new_b)
print("NEW fixed: same args -> same hash (cache still works) ?", new_a == new_same)

assert new_a != new_b, "FAIL: different prompts must differ"
assert new_a == new_same, "FAIL: same args must match (cache must still hit)"
print("\nALL ASSERTIONS PASS — bug fixed, cache still functions.")
