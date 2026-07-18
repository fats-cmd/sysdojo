-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "combo" INTEGER NOT NULL DEFAULT 0,
    "streakCurrent" INTEGER NOT NULL DEFAULT 0,
    "streakBest" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAnswer" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choiceIndex" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "combo" INTEGER NOT NULL,

    CONSTRAINT "DailyAnswer_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "intervalIndex" INTEGER NOT NULL,
    "lapses" INTEGER NOT NULL,
    "dueDay" TEXT NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE INDEX "Review_userId_dueDay_idx" ON "Review"("userId", "dueDay");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_questionId_key" ON "Review"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "DailyAnswer" ADD CONSTRAINT "DailyAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAnswer" ADD CONSTRAINT "DailyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
