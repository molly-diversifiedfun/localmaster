"""Mastering chain stages. Every stage is a pure function:

    process(samples, sample_rate, **params) -> (new_samples, meta_dict)

Stages never mutate their input array and are fully deterministic.
"""
