import BLOG from '@/blog.config'
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'

/**
 * [最终修复版]
 * 安全地清洗并生成RSS内容。
 * @param {object} post - 文章对象
 * @returns {Promise<string>} 清洗后的HTML内容
 */
const createFeedContent = async (post) => {
  // 核心安全检查：如果 post 或 post.summary 不存在，则返回一个空字符串，防止程序崩溃。
  if (!post || !post.summary) {
    return ''
  }

  // 从摘要开始，这是一个包含HTML的字符串
  let content = post.summary

  // 使用正则表达式安全地移除不需要的HTML元素。
  // 即使某些元素不存在，.replace 也不会报错。
  
  // 1. 移除页面顶部的图标
  content = content.replace(/<div class="notion-page-icon-inline">.*?<\/div>/s, '')
  
  // 2. 移除所有的页面属性行
  content = content.replace(/<div class="notion-collection-row">.*?<\/div>/g, '')

  // 清除所有内容后的前后空白，使输出更整洁
  content = content.trim()

  return content
}

/**
 * 生成RSS数据
 * @param {object} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title
  const DESCRIPTION = siteInfo?.description
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  const rssPath = path.resolve('./public/rss/feed.xml')
  
  // 检查并跳过近期更新，此逻辑保持不变
  if (isFeedRecentlyUpdated(rssPath, 10)) {
    return
  }

  console.log('[RSS订阅] 生成 /rss/feed.xml')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE,
    description: DESCRIPTION,
    link: `${LINK}/${SUB_PATH}`,
    language: LANG,
    favicon: `${LINK}/favicon.png`,
    copyright: `All rights reserved ${year}, ${AUTHOR}`,
    author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  // 遍历最新文章
  const latestPostsLimited = latestPosts.slice(0, 10)
  for (const post of latestPostsLimited) {
    // 安全地获取并清洗内容
    const content = await createFeedContent(post)

    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      // description 字段也使用清洗后的内容，使阅读器预览更干净
      description: content, 
      content: `<![CDATA[${content}]]>`,
      date: new Date(post?.publishDay)
    })
  }

  // 写入文件
  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
  } catch (error) {
    console.warn('[RSS 生成失败] 可能运行在只读文件系统，已跳过写入')
  }
}

/**
 * 检查上次更新的辅助函数
 * @param {string} filePath
 * @param {number} intervalMinutes
 * @returns {boolean}
 */
function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}
