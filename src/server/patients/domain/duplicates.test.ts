import { describe, expect, it } from 'vitest';

import { type DuplicateFields, matchRules } from './duplicates';

// A stored patient, and a new one that shares nothing with it. Each test
// changes only what it is about. All values are fake.
const stored: DuplicateFields = {
  firstName: 'Test',
  lastName: 'Person',
  dateOfBirth: '1984-03-09',
  email: 'test.person@example.test',
  phone: '8015550100',
};

const unrelated: DuplicateFields = {
  firstName: 'Other',
  lastName: 'Sample',
  dateOfBirth: '1990-01-01',
  email: 'other.sample@example.test',
  phone: '8015550199',
};

const sameNameAndBirth = {
  firstName: stored.firstName,
  lastName: stored.lastName,
  dateOfBirth: stored.dateOfBirth,
};

describe('matchRules', () => {
  it('matches nothing when nothing is shared', () => {
    expect(matchRules(unrelated, stored)).toEqual([]);
  });

  describe('each rule alone', () => {
    it('email', () => {
      expect(matchRules({ ...unrelated, email: stored.email }, stored)).toEqual(
        ['email'],
      );
    });

    it('phone', () => {
      expect(matchRules({ ...unrelated, phone: stored.phone }, stored)).toEqual(
        ['phone'],
      );
    });

    it('first name, last name and date of birth', () => {
      expect(matchRules({ ...unrelated, ...sameNameAndBirth }, stored)).toEqual(
        ['name_dob'],
      );
    });
  });

  describe('combinations', () => {
    it('all three rules, in a fixed order', () => {
      expect(matchRules({ ...stored }, stored)).toEqual([
        'email',
        'phone',
        'name_dob',
      ]);
    });

    it('email and phone', () => {
      expect(
        matchRules(
          { ...unrelated, email: stored.email, phone: stored.phone },
          stored,
        ),
      ).toEqual(['email', 'phone']);
    });

    it('phone and name with date of birth', () => {
      expect(
        matchRules(
          { ...unrelated, ...sameNameAndBirth, phone: stored.phone },
          stored,
        ),
      ).toEqual(['phone', 'name_dob']);
    });
  });

  describe('missing email or phone never matches missing', () => {
    const noContact = { ...unrelated, email: null, phone: null };

    it.each([
      ['null and null', null, null],
      ['undefined and null', undefined, null],
      ['empty text and null', '', null],
      ['spaces and empty text', '  ', ''],
    ])('email: %s', (_name, candidate, existing) => {
      expect(
        matchRules(
          { ...noContact, email: candidate },
          { ...stored, email: existing },
        ),
      ).toEqual([]);
    });

    it.each([
      ['null and null', null, null],
      ['undefined and null', undefined, null],
      ['empty text and null', '', null],
      ['spaces and empty text', '  ', ''],
    ])('phone: %s', (_name, candidate, existing) => {
      expect(
        matchRules(
          { ...noContact, phone: candidate },
          { ...stored, phone: existing },
        ),
      ).toEqual([]);
    });

    it('a given email does not match a stored patient without one', () => {
      expect(
        matchRules(
          { ...unrelated, phone: null },
          { ...stored, email: null, phone: null },
        ),
      ).toEqual([]);
    });
  });

  describe('letter case and surrounding spaces are ignored', () => {
    it('email', () => {
      expect(
        matchRules(
          { ...unrelated, email: ' TEST.Person@Example.test ' },
          stored,
        ),
      ).toEqual(['email']);
    });

    it('names', () => {
      expect(
        matchRules(
          {
            ...unrelated,
            firstName: ' test ',
            lastName: 'PERSON',
            dateOfBirth: stored.dateOfBirth,
          },
          stored,
        ),
      ).toEqual(['name_dob']);
    });

    it('a stored value with other case and spaces', () => {
      expect(
        matchRules(
          { ...unrelated, ...sameNameAndBirth },
          { ...stored, firstName: 'TEST ', lastName: ' person' },
        ),
      ).toEqual(['name_dob']);
    });
  });

  describe('the comparison is exact, never fuzzy', () => {
    it('last name alone is not a match', () => {
      expect(
        matchRules({ ...unrelated, lastName: stored.lastName }, stored),
      ).toEqual([]);
    });

    it('first and last name alone are not a match', () => {
      expect(
        matchRules(
          {
            ...unrelated,
            firstName: stored.firstName,
            lastName: stored.lastName,
          },
          stored,
        ),
      ).toEqual([]);
    });

    it('the same name with another date of birth is not a match', () => {
      expect(
        matchRules(
          { ...unrelated, ...sameNameAndBirth, dateOfBirth: '1984-03-10' },
          stored,
        ),
      ).toEqual([]);
    });

    it('the same date of birth and last name with another first name is not a match', () => {
      expect(
        matchRules(
          { ...unrelated, ...sameNameAndBirth, firstName: 'Tes' },
          stored,
        ),
      ).toEqual([]);
    });

    it('Jon is not John', () => {
      expect(
        matchRules(
          { ...unrelated, ...sameNameAndBirth, firstName: 'Jon' },
          { ...stored, firstName: 'John' },
        ),
      ).toEqual([]);
    });

    it('a name that differs only by an accent is not a match', () => {
      expect(
        matchRules(
          { ...unrelated, ...sameNameAndBirth, firstName: 'Zoe' },
          { ...stored, firstName: 'Zoë' },
        ),
      ).toEqual([]);
    });

    it('an email that differs by one character is not a match', () => {
      expect(
        matchRules({ ...unrelated, email: 'test.person@example.tes' }, stored),
      ).toEqual([]);
    });

    it('a phone that differs by one digit is not a match', () => {
      expect(matchRules({ ...unrelated, phone: '8015550101' }, stored)).toEqual(
        [],
      );
    });
  });
});
