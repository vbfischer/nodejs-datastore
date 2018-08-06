/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const assert = require('assert');
const async = require('async');
const Datastore = require('../');
const entity = require('../src/entity.js');

describe('Datastore', function() {
  const testKinds = [];
  const datastore = new Datastore({});
  // Override the Key method so we can track what keys are created during the
  // tests. They are then deleted in the `after` hook.
  const key = datastore.key;
  datastore.key = function() {
    const keyObject = key.apply(this, arguments);
    testKinds.push(keyObject.kind);
    return keyObject;
  };

  after(function(done) {
    function deleteEntities(kind, callback) {
      const query = datastore.createQuery(kind).select('__key__');

      datastore.runQuery(query, function(err, entities) {
        if (err) {
          callback(err);
          return;
        }

        const keys = entities.map(function(entity) {
          return entity[datastore.KEY];
        });

        datastore.delete(keys, callback);
      });
    }

    async.each(testKinds, deleteEntities, done);
  });

  it('should allocate IDs', function(done) {
    datastore.allocateIds(datastore.key('Kind'), 10, function(err, keys) {
      assert.ifError(err);
      assert.strictEqual(keys.length, 10);
      assert.strictEqual(entity.isKeyComplete(keys[0]), true);
      done();
    });
  });

  describe('create, retrieve and delete', function() {
    const post = {
      title: 'How to make the perfect pizza in your grill',
      tags: ['pizza', 'grill'],
      publishedAt: new Date(),
      author: 'Silvano',
      isDraft: false,
      wordCount: 400,
      rating: 5.0,
      likes: null,
      metadata: {
        views: 100,
      },
    };

    it('should excludeFromIndexes correctly', function(done) {
      const longString = Buffer.alloc(1501, '.').toString();
      const postKey = datastore.key(['Post', 'post1']);

      const data = {
        longString: longString,
        notMetadata: true,
        longStringArray: [longString],
        metadata: {
          longString: longString,
          otherProperty: 'value',
          obj: {
            longStringArray: [
              {
                longString: longString,
                nestedLongStringArray: [
                  {
                    longString: longString,
                    nestedProperty: true,
                  },
                  {
                    longString: longString,
                  },
                ],
              },
            ],
          },
          longStringArray: [
            {
              longString: longString,
              nestedLongStringArray: [
                {
                  longString: longString,
                  nestedProperty: true,
                },
                {
                  longString: longString,
                },
              ],
            },
          ],
        },
      };

      datastore.save(
        {
          key: postKey,
          data: data,
          excludeFromIndexes: [
            'longString',
            'longStringArray[]',
            'metadata.obj.longString',
            'metadata.obj.longStringArray[].longString',
            'metadata.obj.longStringArray[].nestedLongStringArray[].longString',
            'metadata.longString',
            'metadata.longStringArray[].longString',
            'metadata.longStringArray[].nestedLongStringArray[].longString',
          ],
        },
        function(err) {
          assert.ifError(err);

          datastore.get(postKey, function(err, entity) {
            assert.ifError(err);

            assert.deepStrictEqual(entity, data);
            assert.deepStrictEqual(entity[datastore.KEY], postKey);

            datastore.delete(postKey, done);
          });
        }
      );
    });

    it('should save/get/delete with a key name', function(done) {
      const postKey = datastore.key(['Post', 'post1']);

      datastore.save({key: postKey, data: post}, function(err) {
        assert.ifError(err);

        datastore.get(postKey, function(err, entity) {
          assert.ifError(err);

          assert.deepStrictEqual(entity, post);
          assert.deepStrictEqual(entity[datastore.KEY], postKey);

          datastore.delete(postKey, done);
        });
      });
    });

    it('should save/get/delete with a numeric key id', function(done) {
      const postKey = datastore.key(['Post', 123456789]);

      datastore.save({key: postKey, data: post}, function(err) {
        assert.ifError(err);

        datastore.get(postKey, function(err, entity) {
          assert.ifError(err);

          assert.deepStrictEqual(entity, post);

          datastore.delete(postKey, done);
        });
      });
    });

    it('should save/get/delete a buffer', function(done) {
      const postKey = datastore.key(['Post']);
      const data = {
        buf: Buffer.from('010100000000000000000059400000000000006940', 'hex'),
      };

      datastore.save({key: postKey, data: data}, function(err) {
        assert.ifError(err);

        const assignedId = postKey.id;
        assert(assignedId);

        datastore.get(postKey, function(err, entity) {
          assert.ifError(err);

          assert.deepStrictEqual(entity, data);

          datastore.delete(datastore.key(['Post', assignedId]), done);
        });
      });
    });

    it('should save/get/delete with a generated key id', function(done) {
      const postKey = datastore.key('Post');

      datastore.save({key: postKey, data: post}, function(err) {
        assert.ifError(err);

        // The key's path should now be complete.
        assert(postKey.id);

        datastore.get(postKey, function(err, entity) {
          assert.ifError(err);

          assert.deepStrictEqual(entity, post);

          datastore.delete(postKey, done);
        });
      });
    });

    it('should save/get/update', function(done) {
      const postKey = datastore.key('Post');

      datastore.save({key: postKey, data: post}, function(err) {
        assert.ifError(err);

        datastore.get(postKey, function(err, entity) {
          assert.ifError(err);

          assert.strictEqual(entity.title, post.title);

          entity.title = 'Updated';

          datastore.save(entity, function(err) {
            assert.ifError(err);

            datastore.get(postKey, function(err, entity) {
              assert.ifError(err);
              assert.strictEqual(entity.title, 'Updated');
              datastore.delete(postKey, done);
            });
          });
        });
      });
    });

    it('should save and get with a string ID', function(done) {
      const longIdKey = datastore.key([
        'Post',
        datastore.int('100000000000001234'),
      ]);

      datastore.save(
        {
          key: longIdKey,
          data: {
            test: true,
          },
        },
        function(err) {
          assert.ifError(err);

          datastore.get(longIdKey, function(err, entity) {
            assert.ifError(err);
            assert.strictEqual(entity.test, true);
            done();
          });
        }
      );
    });

    it('should fail explicitly set second insert on save', function(done) {
      const postKey = datastore.key('Post');

      datastore.save({key: postKey, data: post}, function(err) {
        assert.ifError(err);

        // The key's path should now be complete.
        assert(postKey.id);

        datastore.save(
          {
            key: postKey,
            method: 'insert',
            data: post,
          },
          function(err) {
            assert.notStrictEqual(err, null); // should fail insert

            datastore.get(postKey, function(err, entity) {
              assert.ifError(err);

              assert.deepStrictEqual(entity, post);

              datastore.delete(postKey, done);
            });
          }
        );
      });
    });

    it('should fail explicitly set first update on save', function(done) {
      const postKey = datastore.key('Post');

      datastore.save(
        {
          key: postKey,
          method: 'update',
          data: post,
        },
        function(err) {
          assert.notStrictEqual(err, null);
          done();
        }
      );
    });

    it('should save/get/delete multiple entities at once', function(done) {
      const post2 = {
        title: 'How to make the perfect homemade pasta',
        tags: ['pasta', 'homemade'],
        publishedAt: Date('2001-01-01T00:00:00.000Z'),
        author: 'Silvano',
        isDraft: false,
        wordCount: 450,
        rating: 4.5,
      };

      const key1 = datastore.key('Post');
      const key2 = datastore.key('Post');

      datastore.save(
        [{key: key1, data: post}, {key: key2, data: post2}],
        function(err) {
          assert.ifError(err);

          datastore.get([key1, key2], function(err, entities) {
            assert.ifError(err);
            assert.strictEqual(entities.length, 2);

            datastore.delete([key1, key2], done);
          });
        }
      );
    });

    it('should get multiple entities in a stream', function(done) {
      const key1 = datastore.key('Post');
      const key2 = datastore.key('Post');

      datastore.save(
        [{key: key1, data: post}, {key: key2, data: post}],
        function(err) {
          assert.ifError(err);

          let numEntitiesEmitted = 0;

          datastore
            .createReadStream([key1, key2])
            .on('error', done)
            .on('data', function() {
              numEntitiesEmitted++;
            })
            .on('end', function() {
              assert.strictEqual(numEntitiesEmitted, 2);

              datastore.delete([key1, key2], done);
            });
        }
      );
    });

    it('should save keys as a part of entity and query by key', function(done) {
      const personKey = datastore.key(['People', 'US', 'Person', 'name']);

      datastore.save(
        {
          key: personKey,
          data: {
            fullName: 'Full name',
            linkedTo: personKey, // himself
          },
        },
        function(err) {
          assert.ifError(err);

          const query = datastore
            .createQuery('Person')
            .hasAncestor(datastore.key(['People', 'US']))
            .filter('linkedTo', personKey);

          datastore.runQuery(query, function(err, results) {
            assert.ifError(err);

            assert.strictEqual(results[0].fullName, 'Full name');
            assert.deepStrictEqual(results[0].linkedTo, personKey);

            datastore.delete(personKey, done);
          });
        }
      );
    });

    describe('entity types', function() {
      it('should save and decode an int', function(done) {
        const integerValue = 2015;
        const integerType = Datastore.int(integerValue);

        const key = datastore.key('Person');

        datastore.save(
          {
            key: key,
            data: {
              year: integerType,
            },
          },
          function(err) {
            assert.ifError(err);

            datastore.get(key, function(err, entity) {
              assert.ifError(err);
              assert.strictEqual(entity.year, integerValue);
              done();
            });
          }
        );
      });

      it('should save and decode a double', function(done) {
        const doubleValue = 99.99;
        const doubleType = Datastore.double(doubleValue);

        const key = datastore.key('Person');

        datastore.save(
          {
            key: key,
            data: {
              nines: doubleType,
            },
          },
          function(err) {
            assert.ifError(err);

            datastore.get(key, function(err, entity) {
              assert.ifError(err);
              assert.strictEqual(entity.nines, doubleValue);
              done();
            });
          }
        );
      });

      it('should save and decode a geo point', function(done) {
        const geoPointValue = {
          latitude: 40.6894,
          longitude: -74.0447,
        };
        const geoPointType = Datastore.geoPoint(geoPointValue);

        const key = datastore.key('Person');

        datastore.save(
          {
            key: key,
            data: {
              location: geoPointType,
            },
          },
          function(err) {
            assert.ifError(err);

            datastore.get(key, function(err, entity) {
              assert.ifError(err);
              assert.deepStrictEqual(entity.location, geoPointValue);
              done();
            });
          }
        );
      });
    });
  });

  describe('querying the datastore', function() {
    const ancestor = datastore.key(['Book', 'GoT']);

    const keys = [
      // Paths:
      ['Rickard'],
      ['Rickard', 'Character', 'Eddard'],
      ['Catelyn'],
      ['Rickard', 'Character', 'Eddard', 'Character', 'Arya'],
      ['Rickard', 'Character', 'Eddard', 'Character', 'Sansa'],
      ['Rickard', 'Character', 'Eddard', 'Character', 'Robb'],
      ['Rickard', 'Character', 'Eddard', 'Character', 'Bran'],
      ['Rickard', 'Character', 'Eddard', 'Character', 'Jon Snow'],
    ].map(function(path) {
      return datastore.key(['Book', 'GoT', 'Character'].concat(path));
    });

    const characters = [
      {
        name: 'Rickard',
        family: 'Stark',
        appearances: 9,
        alive: false,
      },
      {
        name: 'Eddard',
        family: 'Stark',
        appearances: 9,
        alive: false,
      },
      {
        name: 'Catelyn',
        family: ['Stark', 'Tully'],
        appearances: 26,
        alive: false,
      },
      {
        name: 'Arya',
        family: 'Stark',
        appearances: 33,
        alive: true,
      },
      {
        name: 'Sansa',
        family: 'Stark',
        appearances: 31,
        alive: true,
      },
      {
        name: 'Robb',
        family: 'Stark',
        appearances: 22,
        alive: false,
      },
      {
        name: 'Bran',
        family: 'Stark',
        appearances: 25,
        alive: true,
      },
      {
        name: 'Jon Snow',
        family: 'Stark',
        appearances: 32,
        alive: true,
      },
    ];

    before(function(done) {
      const keysToSave = keys.map(function(key, index) {
        return {
          key: key,
          data: characters[index],
        };
      });

      datastore.save(keysToSave, done);
    });

    after(function(done) {
      datastore.delete(keys, done);
    });

    it('should limit queries', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .limit(5);

      datastore.runQuery(q, function(err, firstEntities, info) {
        assert.ifError(err);
        assert.strictEqual(firstEntities.length, 5);

        const secondQ = datastore
          .createQuery('Character')
          .hasAncestor(ancestor)
          .start(info.endCursor);

        datastore.runQuery(secondQ, function(err, secondEntities) {
          assert.ifError(err);
          assert.strictEqual(secondEntities.length, 3);
          done();
        });
      });
    });

    it('should not go over a limit', function(done) {
      const limit = 3;

      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .limit(limit);

      datastore.runQuery(q, function(err, results) {
        assert.ifError(err);
        assert.strictEqual(results.length, limit);
        done();
      });
    });

    it('should run a query as a stream', function(done) {
      const q = datastore.createQuery('Character').hasAncestor(ancestor);

      let resultsReturned = 0;

      datastore
        .runQueryStream(q)
        .on('error', done)
        .on('data', function() {
          resultsReturned++;
        })
        .on('end', function() {
          assert.strictEqual(resultsReturned, characters.length);
          done();
        });
    });

    it('should not go over a limit with a stream', function(done) {
      const limit = 3;
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .limit(limit);

      let resultsReturned = 0;

      datastore
        .runQueryStream(q)
        .on('error', done)
        .on('data', function() {
          resultsReturned++;
        })
        .on('end', function() {
          assert.strictEqual(resultsReturned, limit);
          done();
        });
    });

    it('should filter queries with simple indexes', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .filter('appearances', '>=', 20);

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);
        assert.strictEqual(entities.length, 6);
        done();
      });
    });

    it('should filter queries with defined indexes', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .filter('family', 'Stark')
        .filter('appearances', '>=', 20);

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);
        assert.strictEqual(entities.length, 6);
        done();
      });
    });

    it('should filter by ancestor', function(done) {
      const q = datastore.createQuery('Character').hasAncestor(ancestor);

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);
        assert.strictEqual(entities.length, characters.length);
        done();
      });
    });

    it('should filter by key', function(done) {
      const key = datastore.key(['Book', 'GoT', 'Character', 'Rickard']);

      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .filter('__key__', key);

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);
        assert.strictEqual(entities.length, 1);
        done();
      });
    });

    it('should order queries', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .order('appearances');

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);

        assert.strictEqual(entities[0].name, characters[0].name);
        assert.strictEqual(entities[7].name, characters[3].name);

        done();
      });
    });

    it('should select projections', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .select(['name', 'family']);

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);

        assert.deepStrictEqual(entities[0], {
          name: 'Arya',
          family: 'Stark',
        });

        assert.deepStrictEqual(entities[8], {
          name: 'Sansa',
          family: 'Stark',
        });

        done();
      });
    });

    it('should paginate with offset and limit', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .offset(2)
        .limit(3)
        .order('appearances');

      datastore.runQuery(q, function(err, entities, info) {
        assert.ifError(err);

        assert.strictEqual(entities.length, 3);
        assert.strictEqual(entities[0].name, 'Robb');
        assert.strictEqual(entities[2].name, 'Catelyn');

        const secondQ = datastore
          .createQuery('Character')
          .hasAncestor(ancestor)
          .order('appearances')
          .start(info.endCursor);

        datastore.runQuery(secondQ, function(err, secondEntities) {
          assert.ifError(err);

          assert.strictEqual(secondEntities.length, 3);
          assert.strictEqual(secondEntities[0].name, 'Sansa');
          assert.strictEqual(secondEntities[2].name, 'Arya');

          done();
        });
      });
    });

    it('should resume from a start cursor', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .offset(2)
        .limit(2)
        .order('appearances');

      datastore.runQuery(q, function(err, entities, info) {
        assert.ifError(err);

        const secondQ = datastore
          .createQuery('Character')
          .hasAncestor(ancestor)
          .order('appearances')
          .start(info.endCursor);

        datastore.runQuery(secondQ, function(err, secondEntities) {
          assert.ifError(err);

          assert.strictEqual(secondEntities.length, 4);
          assert.strictEqual(secondEntities[0].name, 'Catelyn');
          assert.strictEqual(secondEntities[3].name, 'Arya');

          done();
        });
      });
    });

    it('should group queries', function(done) {
      const q = datastore
        .createQuery('Character')
        .hasAncestor(ancestor)
        .groupBy('appearances');

      datastore.runQuery(q, function(err, entities) {
        assert.ifError(err);
        assert.strictEqual(entities.length, characters.length - 1);
        done();
      });
    });

    it('should query from the Query object', function(done) {
      const q = datastore.createQuery('Character');

      q.run(done);
    });
  });

  describe('transactions', function() {
    it('should run in a transaction', function(done) {
      const key = datastore.key(['Company', 'Google']);
      const obj = {
        url: 'www.google.com',
      };

      const transaction = datastore.transaction();

      transaction.run(function(err) {
        assert.ifError(err);

        transaction.get(key, function(err) {
          assert.ifError(err);

          transaction.save({key: key, data: obj});

          transaction.commit(function(err) {
            assert.ifError(err);

            datastore.get(key, function(err, entity) {
              assert.ifError(err);
              assert.deepStrictEqual(entity, obj);
              done();
            });
          });
        });
      });
    });

    it('should commit all saves and deletes at the end', function(done) {
      const deleteKey = datastore.key(['Company', 'Subway']);
      const key = datastore.key(['Company', 'Google']);
      const incompleteKey = datastore.key('Company');

      datastore.save(
        {
          key: deleteKey,
          data: {},
        },
        function(err) {
          assert.ifError(err);

          const transaction = datastore.transaction();

          transaction.run(function(err) {
            assert.ifError(err);

            transaction.delete(deleteKey);

            transaction.save([
              {
                key: key,
                data: {rating: 10},
              },
              {
                key: incompleteKey,
                data: {rating: 100},
              },
            ]);

            transaction.commit(function(err) {
              assert.ifError(err);

              // Incomplete key should have been given an ID.
              assert.strictEqual(incompleteKey.path.length, 2);

              async.parallel(
                [
                  // The key queued for deletion should have been deleted.
                  function(callback) {
                    datastore.get(deleteKey, function(err, entity) {
                      assert.ifError(err);
                      assert.strictEqual(typeof entity, 'undefined');
                      callback();
                    });
                  },

                  // Data should have been updated on the key.
                  function(callback) {
                    datastore.get(key, function(err, entity) {
                      assert.ifError(err);
                      assert.strictEqual(entity.rating, 10);
                      callback();
                    });
                  },
                ],
                done
              );
            });
          });
        }
      );
    });

    it('should use the last modification to a key', function(done) {
      const incompleteKey = datastore.key('Company');
      const key = datastore.key(['Company', 'Google']);

      const transaction = datastore.transaction();

      transaction.run(function(err) {
        assert.ifError(err);

        transaction.save([
          {
            key: key,
            data: {
              rating: 10,
            },
          },
          {
            key: incompleteKey,
            data: {
              rating: 100,
            },
          },
        ]);

        transaction.delete(key);

        transaction.commit(function(err) {
          assert.ifError(err);

          // Should not return a result.
          datastore.get(key, function(err, entity) {
            assert.ifError(err);
            assert.strictEqual(entity, undefined);

            // Incomplete key should have been given an id.
            assert.strictEqual(incompleteKey.path.length, 2);
            done();
          });
        });
      });
    });

    it('should query within a transaction', function(done) {
      const transaction = datastore.transaction();

      transaction.run(function(err) {
        assert.ifError(err);

        const query = transaction.createQuery('Company');

        query.run(function(err, entities) {
          if (err) {
            transaction.rollback(done);
            return;
          }

          assert(entities.length > 0);

          transaction.commit(done);
        });
      });
    });

    it('should read in a readOnly transaction', function(done) {
      const transaction = datastore.transaction({readOnly: true});
      const key = datastore.key(['Company', 'Google']);

      transaction.run(function(err) {
        assert.ifError(err);
        transaction.get(key, done);
      });
    });

    it('should not write in a readOnly transaction', function(done) {
      const transaction = datastore.transaction({readOnly: true});
      const key = datastore.key(['Company', 'Google']);

      transaction.run(function(err) {
        assert.ifError(err);

        transaction.get(key, function(err) {
          assert.ifError(err);

          transaction.save({key: key, data: {}});

          transaction.commit(function(err) {
            assert(err instanceof Error);
            done();
          });
        });
      });
    });
  });
});
