export type MongoRange<T> = {
  $gte?: T;
  $lte?: T;
};

export type QueryMatchStage = {
  eventDate?: MongoRange<string>;
  date? : MongoRange<Date>;
  createdAt? : MongoRange<Date>;
  copyNumber?: string;
};
